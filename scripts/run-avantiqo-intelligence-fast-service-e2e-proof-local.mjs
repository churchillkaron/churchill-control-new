import { register } from "node:module";
import { pathToFileURL } from "node:url";

const CONTRACT = "AVANTIQO_INTELLIGENCE_FAST_SERVICE_E2E_PROOF_V1";
const ENDPOINT_NAME = "avantiqo-intelligence-fast-v1";
const MODEL = "Qwen/Qwen3-30B-A3B-Instruct-2507";
const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const CLEANUP_TIMEOUT_MS = 180000;
const POLL_MS = 2000;

const text = (value, limit = 12000) => String(value ?? "").trim().slice(0, limit);
const list = (value) => Array.isArray(value) ? value : [];
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function assert(value, code) {
  if (!value) throw new Error(`${CONTRACT}_${code}`);
}

function rows(value, keys = []) {
  if (Array.isArray(value)) return value;
  for (const key of [...keys, "data", "items", "results"]) {
    if (Array.isArray(value?.[key])) return value[key];
  }
  return [];
}

function activeWorkers(endpoint = {}) {
  const terminal = new Set(["STOPPED", "TERMINATED", "EXITED", "FAILED", "DELETED"]);
  return list(endpoint.workers).filter((worker) => {
    if (worker?.isStale === true) return false;
    const status = text(worker?.status ?? worker?.workerStatus ?? worker?.runtimeStatus, 80).toUpperCase();
    const desired = text(worker?.desiredStatus ?? worker?.desired_status, 80).toUpperCase();
    if (status && !terminal.has(status)) return true;
    if (desired && !terminal.has(desired)) return true;
    return !status && !desired;
  });
}

function findText(value, depth = 0) {
  if (depth > 8 || value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findText(item, depth + 1);
      if (found) return found;
    }
    return "";
  }
  if (typeof value !== "object") return "";
  for (const key of ["text", "output_text", "content", "message"]) {
    if (typeof value[key] === "string" && value[key].trim()) return value[key].trim();
  }
  for (const key of ["output", "result", "data", "response", "raw"]) {
    const found = findText(value[key], depth + 1);
    if (found) return found;
  }
  return "";
}

function findScheduling(value, depth = 0) {
  if (depth > 8 || !value || typeof value !== "object") return null;
  if (!Array.isArray(value) && value.scheduling && typeof value.scheduling === "object") {
    return value.scheduling;
  }
  for (const child of Array.isArray(value) ? value : Object.values(value)) {
    const found = findScheduling(child, depth + 1);
    if (found) return found;
  }
  return null;
}

function managementKey() {
  const key = text(process.env.RUNPOD_MANAGEMENT_API_KEY || process.env.RUNPOD_API_KEY, 2000);
  assert(key, "RUNPOD_MANAGEMENT_KEY_REQUIRED");
  return key;
}

function queueKeys() {
  return [...new Set([
    process.env.RUNPOD_AVANTIQO_INTELLIGENCE_FAST_API_KEY,
    process.env.RUNPOD_API_KEY,
    process.env.RUNPOD_MANAGEMENT_API_KEY,
  ].map((value) => text(value, 2000)).filter(Boolean))];
}

async function requestJson(url, key, options = {}) {
  const response = await fetch(url, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(options.timeoutMs || 30000),
  });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : {}; } catch { body = null; }
  if (!response.ok) {
    const error = new Error(`${CONTRACT}_HTTP_${response.status}`);
    Object.defineProperty(error, "httpStatus", { value: response.status, enumerable: false });
    throw error;
  }
  assert(body !== null, "NON_JSON_RESPONSE");
  return body;
}

async function endpoint() {
  const body = await requestJson(
    `${REST_BASE}/endpoints?includeTemplate=false&includeWorkers=true`,
    managementKey(),
  );
  const matches = rows(body, ["endpoints", "serverlessEndpoints"])
    .filter((row) => text(row?.name, 300) === ENDPOINT_NAME);
  assert(matches.length === 1, `ENDPOINT_RESOLUTION:${matches.length}`);
  assert(text(matches[0]?.id, 300), "ENDPOINT_ID_REQUIRED");
  return matches[0];
}

async function health(endpointId) {
  let last = null;
  for (const key of queueKeys()) {
    try {
      return await requestJson(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}/health`, key);
    } catch (error) {
      last = error;
      if (![401, 403].includes(Number(error?.httpStatus))) throw error;
    }
  }
  throw last || new Error(`${CONTRACT}_QUEUE_KEY_REQUIRED`);
}

function state(endpointValue, healthValue) {
  const jobs = object(healthValue?.jobs);
  return {
    workers_min: finite(endpointValue?.workersMin, -1),
    workers_max: finite(endpointValue?.workersMax, -1),
    active_workers: activeWorkers(endpointValue).length,
    queued: finite(jobs.inQueue ?? jobs.in_queue, 0),
    in_progress: finite(jobs.inProgress ?? jobs.in_progress, 0),
  };
}

async function cleanRestState({ wait = false } = {}) {
  const deadline = Date.now() + (wait ? CLEANUP_TIMEOUT_MS : 1);
  let latest = null;
  do {
    const endpointValue = await endpoint();
    const endpointId = text(endpointValue.id, 300);
    const healthValue = await health(endpointId);
    latest = state(endpointValue, healthValue);
    if (
      latest.workers_min === 0 &&
      latest.workers_max === 0 &&
      latest.active_workers === 0 &&
      latest.queued === 0 &&
      latest.in_progress === 0
    ) return { endpoint_id: endpointId, ...latest };
    if (!wait) break;
    await sleep(POLL_MS);
  } while (Date.now() < deadline);
  throw new Error(`${CONTRACT}_REST_STATE_INVALID:${JSON.stringify(latest)}`);
}

register("./scripts/next-alias-loader.mjs", pathToFileURL("./"));

const { supabaseAdmin } = await import("@/lib/shared/supabase/admin");
const { ServiceExecutionRuntime } = await import(
  "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime"
);

const organizationResult = await supabaseAdmin
  .from("organizations")
  .select("id,name,organization_type,status,organization_status")
  .eq("name", "Avantiqo Platform")
  .eq("organization_type", "enterprise_group")
  .eq("status", "active")
  .eq("organization_status", "ACTIVE")
  .limit(3);
if (organizationResult.error) throw organizationResult.error;
const organizations = list(organizationResult.data);
assert(organizations.length === 1 && organizations[0]?.id, `PLATFORM_ORGANIZATION_RESOLUTION:${organizations.length}`);
const organizationId = String(organizations[0].id);

const before = await cleanRestState();
const startedAt = Date.now();
const result = await ServiceExecutionRuntime.execute({
  organization_id: organizationId,
  service_id: "ai.text.generate",
  provider_id: "avantiqo-intelligence",
  provider_policy: {
    allowed_providers: ["avantiqo-intelligence"],
    blocked_providers: [],
    external_fallback_allowed: false,
  },
  input: {
    execution_lane: "fast",
    prompt: "Return one short sentence confirming that a fail-closed owned AI service should never silently switch to an unapproved external provider.",
    max_output_tokens: 80,
    temperature: 0.1,
  },
  metadata: {
    module: "INTELLIGENCE",
    operation: "FAST_SERVICE_E2E_CERTIFICATION",
    production_service_certification: true,
    external_fallback_allowed: false,
    raw_reasoning_persisted: false,
  },
  category: "AI",
});
const latencyMs = Date.now() - startedAt;

assert(result?.success === true, "EXECUTION_NOT_SUCCESS");
assert(result?.pending !== true, "UNEXPECTED_PENDING_RESULT");
assert(result?.provider === "avantiqo-intelligence", `PROVIDER_INVALID:${text(result?.provider, 200)}`);
assert(result?.model === MODEL, `MODEL_INVALID:${text(result?.model, 300)}`);
assert(text(result?.usage?.id, 300), "USAGE_ID_REQUIRED");
const responseText = findText(result?.output);
assert(responseText.length > 10, "OUTPUT_REQUIRED");
const scheduling = findScheduling(result?.output);
assert(scheduling, "SCHEDULING_EVIDENCE_REQUIRED");

const leaseResult = await supabaseAdmin
  .from("avantiqo_intelligence_runpod_leases")
  .select("id,lane,state")
  .eq("organization_id", organizationId)
  .eq("state", "ACTIVE");
if (leaseResult.error) throw leaseResult.error;
assert(list(leaseResult.data).length === 0, `ACTIVE_REQUEST_LEASES_REMAIN:${list(leaseResult.data).length}`);

const after = await cleanRestState({ wait: true });

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  provider: result.provider,
  model: result.model,
  service_id: "ai.text.generate",
  execution_lane: "fast",
  response_chars: responseText.length,
  latency_ms: latencyMs,
  usage_id_present: true,
  settlement: result.settlement || null,
  scheduling,
  request_scoped_active_leases_after_test: 0,
  endpoint_rest_state_before: before,
  endpoint_rest_state_after: after,
  owned_intelligence_only: true,
  external_ai_fallback_used: false,
  production_deploy_performed: false,
  secrets_printed: false,
}, null, 2));
console.log(`${CONTRACT}=PASS`);
