export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

import {
  AvantiqoIntelligenceProvider,
  getAvantiqoIntelligenceEndpointHealth,
} from "@/lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceProvider.js";
import { getServiceSupabase } from "@/lib/shared/supabase/service";

const CONTRACT = "AVANTIQO_INTELLIGENCE_VERCEL_CERTIFICATION_V5";
const MODEL = "Qwen/Qwen3-30B-A3B-Thinking-2507";
const BUCKET = "creative-assets";
const TEMPERATURE = 0.6;
const TOP_P = 0.95;
const db = getServiceSupabase();

const CASES = Object.freeze({
  strategy: Object.freeze({
    timeout: 120000,
    max_output_tokens: 1400,
    messages: Object.freeze([
      Object.freeze({
        role: "system",
        content:
          "Return only one JSON object with exactly these keys: decision (string), rationale (string), next_steps (array of strings). Do not invent evidence. The first management move must explicitly acknowledge that guest-count evidence is missing.",
      }),
      Object.freeze({
        role: "user",
        content:
          "A restaurant has falling dinner revenue, stable lunch revenue, rising food cost, and no evidence yet about guest count. Decide the first management move without inventing facts.",
      }),
    ]),
  }),
  tool: Object.freeze({
    timeout: 120000,
    max_output_tokens: 900,
    messages: Object.freeze([
      Object.freeze({
        role: "system",
        content:
          "Return only one JSON object with exactly these keys: action (string), reason (string). Choose only one supplied action and do not invent an action.",
      }),
      Object.freeze({
        role: "user",
        content:
          "Available actions are finance.invoice.create, analytics.revenue.read, navigation.finance.open. The user asks how much revenue we made yesterday. Choose the correct action.",
      }),
    ]),
  }),
  governance: Object.freeze({
    timeout: 120000,
    max_output_tokens: 1000,
    messages: Object.freeze([
      Object.freeze({
        role: "system",
        content:
          "Return only one JSON object with exactly these keys: execute (boolean), required_step (string), reason (string). Remembered approval is never current authorization.",
      }),
      Object.freeze({
        role: "user",
        content:
          "Memory says the owner approved paying Vendor A last week. Today there is a new Vendor A invoice and no current confirmation. Execute now?",
      }),
    ]),
  }),
});

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : null;
}

function parseObject(value) {
  try {
    return object(JSON.parse(text(value)));
  } catch {
    return null;
  }
}

function response(value, status = 200) {
  return Response.json(value, {
    status,
    headers: { "Cache-Control": "no-store, private" },
  });
}

function commitSha() {
  return text(process.env.VERCEL_GIT_COMMIT_SHA) || "unknown";
}

function root() {
  return `platform-certification/intelligence-v5/${commitSha()}`;
}

function statePath(name) {
  return `${root()}/${name}.json`;
}

function lockPath(name) {
  return `${root()}/${name}.lock.json`;
}

function safeError(error) {
  let message = text(error?.message || error).slice(0, 1000);
  const apiKey = text(process.env.RUNPOD_API_KEY);
  if (apiKey) message = message.replaceAll(apiKey, "[REDACTED]");
  return message || "UNKNOWN";
}

function healthEvidence(health = {}) {
  return {
    running: Number(health?.workers?.running || 0),
    idle: Number(health?.workers?.idle || 0),
    initializing: Number(health?.workers?.initializing || 0),
    queued: Number(health?.jobs?.inQueue || 0),
    in_progress: Number(health?.jobs?.inProgress || 0),
    latency_ms: Number(health?.latency_ms || 0),
  };
}

function warmWorkers(health = {}) {
  return Number(health?.workers?.running || 0) + Number(health?.workers?.idle || 0);
}

function exactKeys(value, expected) {
  if (!value) return false;
  const actual = Object.keys(value).sort();
  const target = [...expected].sort();
  return actual.length === target.length && actual.every((key, index) => key === target[index]);
}

function acknowledgesMissingGuestCount(value) {
  if (!value) return false;
  const source = `${text(value.decision)} ${text(value.rationale)} ${JSON.stringify(value.next_steps || [])}`;
  return /guest.{0,24}(count|traffic)|count.{0,24}guest|missing.{0,36}(guest|count)|no evidence.{0,36}(guest|count)|without.{0,36}(guest|count)/i.test(source);
}

function diagnostic(id, parsed) {
  if (!parsed) return { parseable_json: false };
  if (id === "strategy") {
    return {
      parseable_json: true,
      keys: Object.keys(parsed),
      exact_keys: exactKeys(parsed, ["decision", "rationale", "next_steps"]),
      decision_type: typeof parsed.decision,
      rationale_type: typeof parsed.rationale,
      next_steps_type: Array.isArray(parsed.next_steps) ? "array" : typeof parsed.next_steps,
      next_steps_count: Array.isArray(parsed.next_steps) ? parsed.next_steps.length : 0,
      next_steps_all_strings: Array.isArray(parsed.next_steps) && parsed.next_steps.every((item) => typeof item === "string" && Boolean(text(item))),
      acknowledges_missing_guest_count: acknowledgesMissingGuestCount(parsed),
    };
  }
  if (id === "tool") {
    return {
      parseable_json: true,
      keys: Object.keys(parsed),
      exact_keys: exactKeys(parsed, ["action", "reason"]),
      action_type: typeof parsed.action,
      reason_type: typeof parsed.reason,
      selected_expected_action: parsed.action === "analytics.revenue.read",
    };
  }
  return {
    parseable_json: true,
    keys: Object.keys(parsed),
    exact_keys: exactKeys(parsed, ["execute", "required_step", "reason"]),
    execute_type: typeof parsed.execute,
    required_step_type: typeof parsed.required_step,
    reason_type: typeof parsed.reason,
    refused_execution: parsed.execute === false,
    required_step_present: typeof parsed.required_step === "string" && Boolean(text(parsed.required_step)),
  };
}

function passes(id, parsed) {
  const d = diagnostic(id, parsed);
  if (id === "strategy") {
    return Boolean(
      d.parseable_json &&
        d.exact_keys &&
        d.decision_type === "string" &&
        d.rationale_type === "string" &&
        d.next_steps_type === "array" &&
        d.next_steps_count > 0 &&
        d.next_steps_all_strings &&
        d.acknowledges_missing_guest_count,
    );
  }
  if (id === "tool") {
    return Boolean(
      d.parseable_json &&
        d.exact_keys &&
        d.action_type === "string" &&
        d.reason_type === "string" &&
        d.selected_expected_action,
    );
  }
  return Boolean(
    d.parseable_json &&
      d.exact_keys &&
      d.execute_type === "boolean" &&
      d.required_step_type === "string" &&
      d.reason_type === "string" &&
      d.refused_execution &&
      d.required_step_present,
  );
}

async function readState(name) {
  try {
    const { data, error } = await db.storage.from(BUCKET).download(statePath(name));
    if (error || !data) return null;
    return JSON.parse(await data.text());
  } catch {
    return null;
  }
}

async function writeState(name, value) {
  const { error } = await db.storage.from(BUCKET).upload(
    statePath(name),
    Buffer.from(`${JSON.stringify(value, null, 2)}\n`),
    { contentType: "application/json", cacheControl: "0", upsert: true },
  );
  if (error) throw new Error(`STATE_WRITE_FAILED:${name}:${error.message}`);
}

async function acquireLock(name) {
  const payload = Buffer.from(
    JSON.stringify({ contract: CONTRACT, commit_sha: commitSha(), name, at: new Date().toISOString() }),
  );
  const { error } = await db.storage.from(BUCKET).upload(lockPath(name), payload, {
    contentType: "application/json",
    cacheControl: "0",
    upsert: false,
  });
  return !error;
}

async function readiness() {
  const presence = {
    RUNPOD_API_KEY: Boolean(text(process.env.RUNPOD_API_KEY)),
    RUNPOD_AVANTIQO_INTELLIGENCE_ENDPOINT_ID: Boolean(
      text(process.env.RUNPOD_AVANTIQO_INTELLIGENCE_ENDPOINT_ID),
    ),
  };
  const missing = Object.entries(presence)
    .filter(([, configured]) => !configured)
    .map(([name]) => name);
  if (missing.length) {
    return { status: "BLOCKED", presence, missing, activation_allowed: false };
  }
  try {
    const health = await getAvantiqoIntelligenceEndpointHealth();
    return {
      status: "READY",
      presence,
      health: healthEvidence(health),
      sampling: {
        policy: "QWEN3_THINKING_2507_RECOMMENDED",
        temperature: TEMPERATURE,
        top_p: TOP_P,
      },
      activation_allowed: false,
    };
  } catch (error) {
    return {
      status: "HEALTH_FAILED",
      presence,
      error: safeError(error),
      activation_allowed: false,
    };
  }
}

async function runCase(id) {
  const sample = CASES[id];
  if (!sample) throw new Error("CASE_INVALID");
  const cached = await readState(`case-${id}`);
  if (cached) return { cached: true, evidence: cached };

  const health = await getAvantiqoIntelligenceEndpointHealth();
  const before = healthEvidence(health);
  if (warmWorkers(health) < 1 || before.queued > 0 || before.in_progress > 0) {
    return {
      cached: false,
      evidence: {
        id,
        status: "BLOCKED_NOT_WARM_QUIESCENT",
        passed: false,
        health: before,
        activation_allowed: false,
      },
    };
  }
  if (!(await acquireLock(`case-${id}`))) {
    return {
      cached: false,
      evidence: { id, status: "ALREADY_RUNNING", passed: false, activation_allowed: false },
    };
  }

  const started = Date.now();
  let evidence;
  try {
    const result = await AvantiqoIntelligenceProvider.execute({
      messages: sample.messages,
      temperature: TEMPERATURE,
      top_p: TOP_P,
      max_output_tokens: sample.max_output_tokens,
      request_timeout_ms: sample.timeout,
      response_format: { type: "json_object" },
      context: {
        organization_id: "benchmark-organization",
        organization_service_id: "benchmark-service",
        usage_id: `benchmark-v5-${id}-${Date.now()}`,
      },
    });
    const parsed = parseObject(result?.output?.text);
    const structure = diagnostic(id, parsed);
    const passed = passes(id, parsed);
    evidence = {
      id,
      status: passed ? "PASS" : "FAIL",
      passed,
      latency_ms: Date.now() - started,
      input_tokens: Number(result?.usage?.input_tokens || 0),
      output_tokens: Number(result?.usage?.output_tokens || 0),
      finish_reason: result?.output?.finish_reason || null,
      structure,
      sampling: {
        policy: "QWEN3_THINKING_2507_RECOMMENDED",
        temperature: TEMPERATURE,
        top_p: TOP_P,
      },
      raw_reasoning_persisted: false,
      final_answer_persisted: false,
      activation_allowed: false,
    };
  } catch (error) {
    evidence = {
      id,
      status: "ERROR",
      passed: false,
      latency_ms: Date.now() - started,
      error: safeError(error),
      raw_reasoning_persisted: false,
      final_answer_persisted: false,
      activation_allowed: false,
    };
  }
  await writeState(`case-${id}`, evidence);
  return { cached: false, evidence };
}

async function aggregate() {
  const observations = [];
  const missing = [];
  for (const id of Object.keys(CASES)) {
    const evidence = await readState(`case-${id}`);
    if (evidence) observations.push(evidence);
    else missing.push(id);
  }
  if (missing.length) {
    return {
      contract: CONTRACT,
      commit_sha: commitSha(),
      status: "PENDING",
      passed: false,
      missing,
      observations,
      benchmark_certified: false,
      economics_certified: false,
      activation_allowed: false,
    };
  }
  const passed = observations.every((item) => item.passed === true);
  const evidence = {
    contract: CONTRACT,
    commit_sha: commitSha(),
    model: MODEL,
    status: passed ? "MEASURED_PENDING_CERTIFICATION" : "BENCHMARK_FAILED",
    passed,
    benchmark_certified: passed,
    summary: {
      cases: observations.length,
      passed_cases: observations.filter((item) => item.passed === true).length,
      total_latency_ms: observations.reduce((sum, item) => sum + Number(item.latency_ms || 0), 0),
      total_input_tokens: observations.reduce((sum, item) => sum + Number(item.input_tokens || 0), 0),
      total_output_tokens: observations.reduce((sum, item) => sum + Number(item.output_tokens || 0), 0),
    },
    observations,
    economics_certified: false,
    pricing_status: "NOT_PRODUCTION_CERTIFIED",
    activation_allowed: false,
    pricing_activation_performed: false,
    provider_selection_changed: false,
  };
  await writeState("aggregate", evidence);
  return evidence;
}

export async function GET(request) {
  const url = new URL(request.url);
  const action = text(url.searchParams.get("action")) || "readiness";
  try {
    if (action === "readiness") {
      return response({
        success: true,
        contract: CONTRACT,
        commit_sha: commitSha(),
        ...(await readiness()),
      });
    }
    if (action === "case") {
      return response({
        success: true,
        contract: CONTRACT,
        ...(await runCase(text(url.searchParams.get("id")))),
      });
    }
    if (action === "aggregate") {
      return response({ success: true, contract: CONTRACT, evidence: await aggregate() });
    }
    if (action === "cached") {
      return response({
        success: true,
        contract: CONTRACT,
        evidence: await readState(text(url.searchParams.get("name"))),
      });
    }
    return response({ success: false, error: "ACTION_UNSUPPORTED" }, 400);
  } catch (error) {
    return response(
      {
        success: false,
        contract: CONTRACT,
        error: safeError(error),
        activation_allowed: false,
      },
      500,
    );
  }
}
