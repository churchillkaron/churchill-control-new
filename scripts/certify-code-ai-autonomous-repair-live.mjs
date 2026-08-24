import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvFile } from "node:process";
import { executeCodeAIMission } from "../lib/code/runtime/CodeAIMissionRuntime.js";

const CONTRACT = "AVANTIQO_CODE_AUTONOMOUS_REPAIR_LIVE_CERTIFICATION_V1";
const ENGINE_CONTRACT = "AVANTIQO_CODE_ENGINE_V1";
const FOUNDATION_MODEL = "Qwen/Qwen3-Coder-30B-A3B-Instruct";
const RUNTIME_MODEL = "Qwen/Qwen3-Coder-30B-A3B-Instruct-FP8";
const EXPECTED_QUANTIZATION = "fp8";
const EXPECTED_SERVING_RUNTIME = "vllm";
const FIXTURE = "tests/fixtures/code-ai-autonomous-repair/invoice-total.mjs";
const VERIFIER = "scripts/code-ai-autonomous-repair-fixture-test.mjs";
const CODE_ENDPOINT_NAME = "avantiqo-code-v1";
const API_BASE = "https://api.runpod.ai/v2";
const RUNPOD_REST_BASE = "https://rest.runpod.io/v1";
const MAX_CONCURRENCY_REPLANS = 4;
const PROGRESS_INTERVAL_MS = 15_000;

function text(value) {
  return String(value ?? "").trim();
}

function loadLocalEnvironment() {
  const localEnvPath = resolve(process.cwd(), ".env.local");
  if (!existsSync(localEnvPath)) return false;
  loadEnvFile(localEnvPath);
  return true;
}

const LOCAL_ENV_LOADED = loadLocalEnvironment();
const REPOSITORY = process.env.AVANTIQO_CODE_SANDBOX_REPOSITORY || "https://github.com/churchillkaron/churchill-control-new";
const REF = process.env.AVANTIQO_CODE_SANDBOX_REF || "main";
const API_KEY = text(process.env.RUNPOD_AVANTIQO_CODE_API_KEY) || text(process.env.RUNPOD_API_KEY);

if (!API_KEY) throw new Error("RUNPOD_AVANTIQO_CODE_API_KEY_OR_RUNPOD_API_KEY_REQUIRED");

function progress(event, details = {}) {
  console.log(JSON.stringify({
    event: `AVANTIQO_CODE_AUTONOMOUS_REPAIR_${event}`,
    at: new Date().toISOString(),
    ...details,
  }));
}

async function withHeartbeat(stage, operation) {
  const startedAt = Date.now();
  progress("STAGE_START", { stage });
  const timer = setInterval(() => {
    progress("PROGRESS", {
      stage,
      elapsed_seconds: Math.round((Date.now() - startedAt) / 1000),
    });
  }, PROGRESS_INTERVAL_MS);
  timer.unref?.();

  try {
    const result = await operation();
    progress("STAGE_COMPLETE", {
      stage,
      elapsed_seconds: Math.round((Date.now() - startedAt) / 1000),
    });
    return result;
  } catch (error) {
    progress("STAGE_FAILED", {
      stage,
      elapsed_seconds: Math.round((Date.now() - startedAt) / 1000),
      error: text(error?.message || error).slice(0, 500),
    });
    throw error;
  } finally {
    clearInterval(timer);
  }
}

async function readJson(response, label) {
  const raw = await response.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    throw new Error(`${label}_INVALID_JSON`);
  }
  if (!response.ok) throw new Error(`${label}_HTTP_${response.status}`);
  return body;
}

async function resolveCodeEndpoint() {
  const explicitId = text(process.env.RUNPOD_AVANTIQO_CODE_ENDPOINT_ID);
  if (explicitId) {
    return { id: explicitId, source: "ENV" };
  }

  const managementKey = text(process.env.RUNPOD_MANAGEMENT_API_KEY);
  if (!managementKey) {
    throw new Error("RUNPOD_AVANTIQO_CODE_ENDPOINT_ID_OR_RUNPOD_MANAGEMENT_API_KEY_REQUIRED");
  }

  const response = await fetch(`${RUNPOD_REST_BASE}/endpoints?includeTemplate=true&includeWorkers=true`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${managementKey}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(30_000),
  });
  const endpoints = await readJson(response, "RUNPOD_ENDPOINT_DISCOVERY");
  if (!Array.isArray(endpoints)) throw new Error("RUNPOD_ENDPOINT_LIST_INVALID");

  const matches = endpoints.filter((endpoint) => text(endpoint?.name) === CODE_ENDPOINT_NAME);
  if (matches.length !== 1) {
    throw new Error(`RUNPOD_CODE_ENDPOINT_EXACT_NAME_RESOLUTION_FAILED:matches=${matches.length}`);
  }
  const id = text(matches[0]?.id);
  if (!id) throw new Error("RUNPOD_CODE_ENDPOINT_ID_MISSING_AFTER_RESOLUTION");
  return { id, source: "EXACT_NAME" };
}

progress("START", {
  contract: CONTRACT,
  local_env_loaded: LOCAL_ENV_LOADED,
  ref: REF,
  production_deploy_performed: false,
});
const ENDPOINT_RESOLUTION = await withHeartbeat("resolve_code_endpoint", resolveCodeEndpoint);
const ENDPOINT = ENDPOINT_RESOLUTION.id;
progress("ENDPOINT_RESOLVED", { source: ENDPOINT_RESOLUTION.source });

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cleanJson(value) {
  const raw = String(value || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  try { return JSON.parse(raw); } catch {}
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("CODE_AI_AUTONOMOUS_REPAIR_JSON_REQUIRED");
  return JSON.parse(raw.slice(start, end + 1));
}

async function runOwnedRepairPlanner({ fileContent, failure }) {
  progress("RUNPOD_SUBMIT_START", { capability: "ai.code.debug" });
  const submit = await fetch(`${API_BASE}/${ENDPOINT}/run`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      input: {
        contract: ENGINE_CONTRACT,
        capability: "ai.code.debug",
        foundation_model: FOUNDATION_MODEL,
        organization_id: "benchmark-only",
        organization_service_id: "benchmark-only",
        usage_id: `code-autonomous-repair-cert-${Date.now()}`,
        instruction: [
          "Return exactly one JSON object and no markdown.",
          "You are repairing a real failing repository fixture from observed evidence.",
          `Path: ${FIXTURE}`,
          "Observed complete file content:",
          fileContent,
          "Observed verifier failure:",
          JSON.stringify(failure),
          `The verifier is: node ${VERIFIER}`,
          "Diagnose the bug and return the complete corrected file content.",
          `Required JSON shape: {\"path\":\"${FIXTURE}\",\"content\":\"complete corrected file content\",\"diagnosis\":\"concise observed diagnosis\"}`,
          "Do not modify any other file. Do not expose chain-of-thought.",
        ].join("\n\n"),
        structured_specification: {
          certification_contract: CONTRACT,
          target_file: FIXTURE,
          verifier: VERIFIER,
          allowed_files: [FIXTURE],
          response_style: "strict_json",
        },
      },
    }),
    signal: AbortSignal.timeout(30_000),
  });
  const submitted = await submit.json().catch(() => ({}));
  if (!submit.ok) throw new Error(`RUNPOD_SUBMIT_HTTP_${submit.status}:${submitted?.error || submitted?.message || ""}`);
  const jobId = String(submitted?.id || "").trim();
  if (!jobId) throw new Error("RUNPOD_JOB_ID_REQUIRED");
  progress("RUNPOD_JOB_SUBMITTED", { job_id: jobId });

  const timeoutMs = Math.max(60_000, Math.min(20 * 60_000, Number(process.env.AVANTIQO_CODE_AUTONOMOUS_CERT_TIMEOUT_MS || 15 * 60_000)));
  const deadline = Date.now() + timeoutMs;
  const startedAt = Date.now();
  let body = submitted;
  let lastStatus = null;
  let lastProgressAt = 0;
  while (Date.now() < deadline) {
    const status = String(body?.status || "").toUpperCase() || "UNKNOWN";
    if (status !== lastStatus || Date.now() - lastProgressAt >= PROGRESS_INTERVAL_MS) {
      progress("RUNPOD_JOB_STATUS", {
        job_id: jobId,
        status,
        elapsed_seconds: Math.round((Date.now() - startedAt) / 1000),
      });
      lastStatus = status;
      lastProgressAt = Date.now();
    }
    if (status === "COMPLETED") break;
    if (["FAILED", "CANCELLED", "TIMED_OUT"].includes(status)) {
      throw new Error(`RUNPOD_JOB_${status}:${body?.error || body?.message || ""}`);
    }
    await delay(2000);
    const response = await fetch(`${API_BASE}/${ENDPOINT}/status/${jobId}`, {
      headers: { Authorization: `Bearer ${API_KEY}`, Accept: "application/json" },
      signal: AbortSignal.timeout(30_000),
    });
    body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`RUNPOD_STATUS_HTTP_${response.status}`);
  }
  if (String(body?.status || "").toUpperCase() !== "COMPLETED") {
    throw new Error(`RUNPOD_JOB_TIMEOUT:${jobId}`);
  }

  const output = body.output || {};
  if (String(output.provider || "") !== "avantiqo-code") throw new Error("CODE_AI_AUTONOMOUS_REPAIR_PROVIDER_MISMATCH");
  if (String(output.engine_contract || "") !== ENGINE_CONTRACT) throw new Error("CODE_AI_AUTONOMOUS_REPAIR_ENGINE_CONTRACT_MISMATCH");
  if (String(output.foundation_model || "") !== FOUNDATION_MODEL) throw new Error("CODE_AI_AUTONOMOUS_REPAIR_MODEL_MISMATCH");
  if (String(output.runtime_model || "") !== RUNTIME_MODEL) {
    throw new Error(`CODE_AI_AUTONOMOUS_REPAIR_RUNTIME_MODEL_MISMATCH:${output.runtime_model || "missing"}`);
  }
  if (String(output.quantization || "").toLowerCase() !== EXPECTED_QUANTIZATION) {
    throw new Error(`CODE_AI_AUTONOMOUS_REPAIR_QUANTIZATION_MISMATCH:${output.quantization || "missing"}`);
  }
  if (String(output.serving_runtime || "").toLowerCase() !== EXPECTED_SERVING_RUNTIME) {
    throw new Error(`CODE_AI_AUTONOMOUS_REPAIR_SERVING_RUNTIME_MISMATCH:${output.serving_runtime || "missing"}`);
  }
  const repair = cleanJson(output.result);
  if (repair.path !== FIXTURE) throw new Error(`CODE_AI_AUTONOMOUS_REPAIR_PATH_INVALID:${repair.path || "missing"}`);
  if (!String(repair.content || "").trim()) throw new Error("CODE_AI_AUTONOMOUS_REPAIR_CONTENT_REQUIRED");
  progress("RUNPOD_REPAIR_READY", {
    job_id: jobId,
    diagnosis_present: Boolean(String(repair.diagnosis || "").trim()),
  });
  return { jobId, output, repair };
}

function repairOperations(repairContent) {
  return [
    { id: "cert_apply_owned_repair", action: "apply_files", description: "Apply the owned Code model repair to the isolated fixture only.", input: { files: [{ path: FIXTURE, content: repairContent }] } },
    { id: "cert_verify_repair", action: "verify", description: "Run the real verifier after repair.", input: { command: "node", args: [VERIFIER], cwd: "." } },
    { id: "cert_diff_repair", action: "diff", description: "Capture the final evidence-backed repair diff.", input: {} },
  ];
}

async function executeRepairWithConcurrencyRecovery({ objective, resumeState, repairContent }) {
  let concurrencyReplans = 0;
  let result = await withHeartbeat("sandbox_apply_repair", () => executeCodeAIMission({
    objective,
    repository_url: REPOSITORY,
    ref: REF,
    resume_state: resumeState,
    operations: repairOperations(repairContent),
  }));

  while (result.status === "replan_required" && concurrencyReplans < MAX_CONCURRENCY_REPLANS) {
    concurrencyReplans += 1;
    progress("CONCURRENCY_REPLAN", {
      attempt: concurrencyReplans,
      previous_reason: result.reason || "CODE_AI_BASE_COMMIT_MOVED_REPLAN_REQUIRED",
    });
    result = await withHeartbeat(`sandbox_apply_repair_replan_${concurrencyReplans}`, () => executeCodeAIMission({
      objective,
      repository_url: REPOSITORY,
      ref: REF,
      resume_state: result.state,
      operations: repairOperations(repairContent),
    }));
  }

  if (result.status === "replan_required") {
    throw new Error(`CODE_AI_AUTONOMOUS_REPAIR_MAIN_MOVING_REPLAN_LIMIT_EXCEEDED:${concurrencyReplans}`);
  }

  return { result, concurrencyReplans };
}

const objective = "Observe the intentionally broken invoice-total certification fixture, diagnose the real verifier failure, repair only that fixture in an isolated Vercel Sandbox, verify the repair, and produce an evidence-backed diff without mutating GitHub main.";

const observed = await withHeartbeat("sandbox_observe_failure", () => executeCodeAIMission({
  objective,
  repository_url: REPOSITORY,
  ref: REF,
  operations: [
    { id: "cert_inspect", action: "inspect", description: "Establish repository baseline.", input: {} },
    { id: "cert_read_fixture", action: "read", description: "Read the complete broken certification fixture.", input: { file_path: FIXTURE, start_line: 1, end_line: 200 } },
    { id: "cert_observe_failure", action: "verify", description: "Observe the real failing verifier before any repair.", input: { command: "node", args: [VERIFIER], cwd: "." } },
  ],
}));

progress("OBSERVATION_COMPLETE", {
  status: observed.status,
  base_commit: observed.state?.base_commit || null,
});
if (observed.status !== "repair_required") {
  throw new Error(`CODE_AI_AUTONOMOUS_REPAIR_EXPECTED_INITIAL_FAILURE:${observed.status}`);
}
const readEvidence = (observed.state?.evidence || []).find((item) => item?.operation_id === "cert_read_fixture" && item?.action === "read");
const fileContent = String(readEvidence?.result?.content || "");
if (!fileContent) throw new Error("CODE_AI_AUTONOMOUS_REPAIR_READ_EVIDENCE_REQUIRED");
const failure = (observed.state?.failures || []).find((item) => item?.operation_id === "cert_observe_failure");
if (!failure) throw new Error("CODE_AI_AUTONOMOUS_REPAIR_FAILURE_EVIDENCE_REQUIRED");

const planned = await withHeartbeat("owned_code_repair", () => runOwnedRepairPlanner({ fileContent, failure }));
const repairExecution = await executeRepairWithConcurrencyRecovery({
  objective,
  resumeState: observed.state,
  repairContent: planned.repair.content,
});
const repaired = repairExecution.result;

if (!repaired.success || repaired.status !== "completed") {
  throw new Error(`CODE_AI_AUTONOMOUS_REPAIR_MISSION_FAILED:${repaired.reason || repaired.status}`);
}
const changed = [...new Set(repaired.state?.files_changed || [])];
if (changed.length !== 1 || changed[0] !== FIXTURE) {
  throw new Error(`CODE_AI_AUTONOMOUS_REPAIR_SCOPE_VIOLATION:${changed.join(",")}`);
}
if (!(repaired.state?.verification || []).some((item) => item?.operation_id === "cert_verify_repair" && item?.passed === true)) {
  throw new Error("CODE_AI_AUTONOMOUS_REPAIR_VERIFICATION_EVIDENCE_REQUIRED");
}
if (!String(repaired.state?.patch || "").includes(FIXTURE)) {
  throw new Error("CODE_AI_AUTONOMOUS_REPAIR_DIFF_EVIDENCE_REQUIRED");
}

progress("CERTIFICATION_COMPLETE", {
  provider_job_id: planned.jobId,
  concurrency_replans_recovered: repairExecution.concurrencyReplans,
  changed_files: changed,
});
console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  provider: planned.output.provider,
  foundation_model: planned.output.foundation_model,
  runtime_model: planned.output.runtime_model,
  serving_runtime: planned.output.serving_runtime,
  quantization: planned.output.quantization,
  provider_job_id: planned.jobId,
  planner_inference_count: 1,
  concurrency_replans_recovered: repairExecution.concurrencyReplans,
  additional_inference_submitted_due_to_concurrency: false,
  endpoint_resolution_source: ENDPOINT_RESOLUTION.source,
  local_env_loaded: LOCAL_ENV_LOADED,
  observed_failure: true,
  diagnosis_present: Boolean(String(planned.repair.diagnosis || "").trim()),
  isolated_repair_applied: true,
  verification_passed: true,
  diff_verified: true,
  changed_files: changed,
  base_commit: repaired.state.base_commit,
  github_main_mutated: false,
  production_deploy_performed: false,
  secrets_printed: false,
}, null, 2));
