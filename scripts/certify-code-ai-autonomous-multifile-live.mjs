import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvFile } from "node:process";
import { executeCodeAIMission } from "../lib/code/runtime/CodeAIMissionRuntime.js";

const CONTRACT = "AVANTIQO_CODE_AUTONOMOUS_MULTIFILE_LIVE_CERTIFICATION_V1";
const ENGINE_CONTRACT = "AVANTIQO_CODE_ENGINE_V1";
const FOUNDATION_MODEL = "Qwen/Qwen3-Coder-30B-A3B-Instruct";
const RUNTIME_MODEL = "Qwen/Qwen3-Coder-30B-A3B-Instruct-FP8";
const EXPECTED_QUANTIZATION = "fp8";
const EXPECTED_SERVING_RUNTIME = "vllm";
const FIXTURE_DIR = "tests/fixtures/code-ai-autonomous-multifile";
const HELPER = `${FIXTURE_DIR}/normalize-money.mjs`;
const SUMMARY = `${FIXTURE_DIR}/invoice-summary.mjs`;
const ALLOWED_FILES = Object.freeze([HELPER, SUMMARY]);
const VERIFIER = "scripts/code-ai-autonomous-multifile-fixture-test.mjs";
const API_BASE = "https://api.runpod.ai/v2";
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
const ENDPOINT = text(process.env.RUNPOD_AVANTIQO_CODE_ENDPOINT_ID);
const API_KEY = text(process.env.RUNPOD_AVANTIQO_CODE_API_KEY) || text(process.env.RUNPOD_API_KEY);
if (!ENDPOINT) throw new Error("RUNPOD_AVANTIQO_CODE_ENDPOINT_ID_REQUIRED");
if (!API_KEY) throw new Error("RUNPOD_AVANTIQO_CODE_API_KEY_OR_RUNPOD_API_KEY_REQUIRED");

function progress(event, details = {}) {
  console.log(JSON.stringify({
    event: `AVANTIQO_CODE_AUTONOMOUS_MULTIFILE_${event}`,
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

function cleanJson(value) {
  const raw = text(value)
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  try {
    return JSON.parse(raw);
  } catch {}
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("CODE_AI_AUTONOMOUS_MULTIFILE_JSON_REQUIRED");
  return JSON.parse(raw.slice(start, end + 1));
}

async function runOwnedMultifilePlanner({ helperContent, summaryContent, failure }) {
  progress("RUNPOD_SUBMIT_START", { capability: "ai.code.debug", expected_file_count: 2 });
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
        usage_id: `code-autonomous-multifile-cert-${Date.now()}`,
        instruction: [
          "Return exactly one JSON object and no markdown.",
          "Repair a real two-file repository defect from observed evidence.",
          "Both files contain independent correctness defects and both must be repaired.",
          `Allowed file 1: ${HELPER}`,
          helperContent,
          `Allowed file 2: ${SUMMARY}`,
          summaryContent,
          "Observed verifier failure:",
          JSON.stringify(failure),
          `Verifier: node ${VERIFIER}`,
          "Required behavior:",
          "- normalizeMoney must convert numeric strings with Number(value), preserve finite numbers, and return 0 for invalid values.",
          "- summarizeInvoice must read line.total, sum only finite normalized totals, and count only lines whose normalized total came from a finite numeric value.",
          "Return complete final contents for BOTH files.",
          `Required JSON shape: {\"files\":[{\"path\":\"${HELPER}\",\"content\":\"complete final file\"},{\"path\":\"${SUMMARY}\",\"content\":\"complete final file\"}],\"diagnosis\":\"concise observed diagnosis\"}`,
          "Do not change any other file. Do not expose chain-of-thought.",
        ].join("\n\n"),
        structured_specification: {
          certification_contract: CONTRACT,
          allowed_files: ALLOWED_FILES,
          required_changed_file_count: 2,
          verifier: VERIFIER,
          response_style: "strict_json",
        },
      },
    }),
    signal: AbortSignal.timeout(30_000),
  });
  const submitted = await submit.json().catch(() => ({}));
  if (!submit.ok) {
    throw new Error(`RUNPOD_SUBMIT_HTTP_${submit.status}:${text(submitted?.error || submitted?.message)}`);
  }
  const jobId = text(submitted?.id);
  if (!jobId) throw new Error("RUNPOD_JOB_ID_REQUIRED");
  progress("RUNPOD_JOB_SUBMITTED", { job_id: jobId });

  const timeoutMs = Math.max(
    60_000,
    Math.min(20 * 60_000, Number(process.env.AVANTIQO_CODE_AUTONOMOUS_CERT_TIMEOUT_MS || 15 * 60_000)),
  );
  const startedAt = Date.now();
  const deadline = startedAt + timeoutMs;
  let body = submitted;
  let lastStatus = null;
  let lastProgressAt = 0;
  while (Date.now() < deadline) {
    const status = text(body?.status).toUpperCase() || "UNKNOWN";
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
      throw new Error(`RUNPOD_JOB_${status}:${text(body?.error || body?.message)}`);
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 2000));
    const response = await fetch(`${API_BASE}/${ENDPOINT}/status/${jobId}`, {
      headers: { Authorization: `Bearer ${API_KEY}`, Accept: "application/json" },
      signal: AbortSignal.timeout(30_000),
    });
    body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`RUNPOD_STATUS_HTTP_${response.status}`);
  }
  if (text(body?.status).toUpperCase() !== "COMPLETED") {
    throw new Error(`RUNPOD_JOB_TIMEOUT:${jobId}`);
  }

  const output = body.output || {};
  if (text(output.provider) !== "avantiqo-code") throw new Error("CODE_AI_AUTONOMOUS_MULTIFILE_PROVIDER_MISMATCH");
  if (text(output.engine_contract) !== ENGINE_CONTRACT) throw new Error("CODE_AI_AUTONOMOUS_MULTIFILE_ENGINE_CONTRACT_MISMATCH");
  if (text(output.foundation_model) !== FOUNDATION_MODEL) throw new Error("CODE_AI_AUTONOMOUS_MULTIFILE_FOUNDATION_MODEL_MISMATCH");
  if (text(output.runtime_model) !== RUNTIME_MODEL) throw new Error("CODE_AI_AUTONOMOUS_MULTIFILE_RUNTIME_MODEL_MISMATCH");
  if (text(output.quantization).toLowerCase() !== EXPECTED_QUANTIZATION) throw new Error("CODE_AI_AUTONOMOUS_MULTIFILE_QUANTIZATION_MISMATCH");
  if (text(output.serving_runtime).toLowerCase() !== EXPECTED_SERVING_RUNTIME) throw new Error("CODE_AI_AUTONOMOUS_MULTIFILE_SERVING_RUNTIME_MISMATCH");
  if (output.raw_reasoning_persisted !== false) throw new Error("CODE_AI_AUTONOMOUS_MULTIFILE_REASONING_BOUNDARY_FAILED");

  const repair = cleanJson(output.result);
  const files = Array.isArray(repair?.files) ? repair.files : [];
  if (files.length !== ALLOWED_FILES.length) {
    throw new Error(`CODE_AI_AUTONOMOUS_MULTIFILE_FILE_COUNT_INVALID:${files.length}`);
  }
  const byPath = new Map();
  for (const file of files) {
    const path = text(file?.path);
    const content = String(file?.content ?? "");
    if (!ALLOWED_FILES.includes(path)) throw new Error(`CODE_AI_AUTONOMOUS_MULTIFILE_PATH_INVALID:${path || "missing"}`);
    if (!content.trim()) throw new Error(`CODE_AI_AUTONOMOUS_MULTIFILE_CONTENT_REQUIRED:${path}`);
    if (byPath.has(path)) throw new Error(`CODE_AI_AUTONOMOUS_MULTIFILE_DUPLICATE_PATH:${path}`);
    byPath.set(path, content);
  }
  for (const path of ALLOWED_FILES) {
    if (!byPath.has(path)) throw new Error(`CODE_AI_AUTONOMOUS_MULTIFILE_MISSING_PATH:${path}`);
  }
  progress("RUNPOD_REPAIR_READY", {
    job_id: jobId,
    diagnosis_present: Boolean(text(repair?.diagnosis)),
    file_count: byPath.size,
  });
  return {
    jobId,
    output,
    diagnosisPresent: Boolean(text(repair?.diagnosis)),
    files: ALLOWED_FILES.map((path) => ({ path, content: byPath.get(path) })),
  };
}

function repairOperations(files) {
  return [
    {
      id: "multifile_apply_owned_repair",
      action: "apply_files",
      description: "Apply the owned two-file repair in the isolated workspace.",
      input: { files },
    },
    {
      id: "multifile_verify_repair",
      action: "verify",
      description: "Run the multi-file verifier after the owned repair.",
      input: { command: "node", args: [VERIFIER], cwd: "." },
    },
    {
      id: "multifile_diff_repair",
      action: "diff",
      description: "Capture the final two-file repair diff.",
      input: {},
    },
  ];
}

async function executeRepairWithConcurrencyRecovery({ objective, resumeState, files }) {
  let concurrencyReplans = 0;
  let result = await withHeartbeat("sandbox_apply_multifile_repair", () => executeCodeAIMission({
    objective,
    repository_url: REPOSITORY,
    ref: REF,
    resume_state: resumeState,
    operations: repairOperations(files),
  }));
  while (result.status === "replan_required" && concurrencyReplans < MAX_CONCURRENCY_REPLANS) {
    concurrencyReplans += 1;
    progress("CONCURRENCY_REPLAN", { attempt: concurrencyReplans, reason: result.reason || null });
    result = await withHeartbeat(`sandbox_apply_multifile_repair_replan_${concurrencyReplans}`, () => executeCodeAIMission({
      objective,
      repository_url: REPOSITORY,
      ref: REF,
      resume_state: result.state,
      operations: repairOperations(files),
    }));
  }
  if (result.status === "replan_required") {
    throw new Error(`CODE_AI_AUTONOMOUS_MULTIFILE_REPLAN_LIMIT_EXCEEDED:${concurrencyReplans}`);
  }
  return { result, concurrencyReplans };
}

const objective = "Observe the intentionally broken two-file invoice normalization fixture, understand the cross-file contract, repair both files with the Avantiqo-owned Code model in an isolated Vercel Sandbox, verify behavior, and produce an evidence-backed two-file diff without mutating GitHub main.";

progress("START", {
  contract: CONTRACT,
  local_env_loaded: LOCAL_ENV_LOADED,
  ref: REF,
  expected_changed_files: ALLOWED_FILES,
  production_deploy_performed: false,
});

const observed = await withHeartbeat("sandbox_observe_multifile_failure", () => executeCodeAIMission({
  objective,
  repository_url: REPOSITORY,
  ref: REF,
  operations: [
    { id: "multifile_inspect", action: "inspect", description: "Establish repository baseline.", input: {} },
    { id: "multifile_read_helper", action: "read", description: "Read the money normalization helper.", input: { file_path: HELPER, start_line: 1, end_line: 200 } },
    { id: "multifile_read_summary", action: "read", description: "Read the invoice summary consumer.", input: { file_path: SUMMARY, start_line: 1, end_line: 240 } },
    { id: "multifile_observe_failure", action: "verify", description: "Observe the real multi-file verifier failure before repair.", input: { command: "node", args: [VERIFIER], cwd: "." } },
  ],
}));

if (observed.status !== "repair_required") {
  throw new Error(`CODE_AI_AUTONOMOUS_MULTIFILE_EXPECTED_INITIAL_FAILURE:${observed.status}`);
}
function readEvidence(operationId) {
  return (observed.state?.evidence || []).find((item) => item?.operation_id === operationId && item?.action === "read");
}
const helperContent = String(readEvidence("multifile_read_helper")?.result?.content || "");
const summaryContent = String(readEvidence("multifile_read_summary")?.result?.content || "");
if (!helperContent || !summaryContent) throw new Error("CODE_AI_AUTONOMOUS_MULTIFILE_READ_EVIDENCE_REQUIRED");
const failure = (observed.state?.failures || []).find((item) => item?.operation_id === "multifile_observe_failure");
if (!failure) throw new Error("CODE_AI_AUTONOMOUS_MULTIFILE_FAILURE_EVIDENCE_REQUIRED");

const planned = await withHeartbeat("owned_multifile_code_repair", () => runOwnedMultifilePlanner({
  helperContent,
  summaryContent,
  failure,
}));
const repairExecution = await executeRepairWithConcurrencyRecovery({
  objective,
  resumeState: observed.state,
  files: planned.files,
});
const repaired = repairExecution.result;
if (!repaired.success || repaired.status !== "completed") {
  throw new Error(`CODE_AI_AUTONOMOUS_MULTIFILE_MISSION_FAILED:${repaired.reason || repaired.status}`);
}
const changed = [...new Set(repaired.state?.files_changed || [])].sort();
const expectedChanged = [...ALLOWED_FILES].sort();
if (JSON.stringify(changed) !== JSON.stringify(expectedChanged)) {
  throw new Error(`CODE_AI_AUTONOMOUS_MULTIFILE_SCOPE_VIOLATION:${changed.join(",")}`);
}
if (!(repaired.state?.verification || []).some((item) => item?.operation_id === "multifile_verify_repair" && item?.passed === true)) {
  throw new Error("CODE_AI_AUTONOMOUS_MULTIFILE_VERIFICATION_EVIDENCE_REQUIRED");
}
for (const path of ALLOWED_FILES) {
  if (!String(repaired.state?.patch || "").includes(path)) {
    throw new Error(`CODE_AI_AUTONOMOUS_MULTIFILE_DIFF_EVIDENCE_REQUIRED:${path}`);
  }
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
  expected_changed_file_count: 2,
  changed_file_count: changed.length,
  changed_files: changed,
  cross_file_read_evidence: true,
  initial_verifier_failure_observed: true,
  diagnosis_present: planned.diagnosisPresent,
  isolated_multifile_repair_applied: true,
  verification_passed: true,
  diff_verified: true,
  concurrency_replans_recovered: repairExecution.concurrencyReplans,
  additional_inference_submitted_due_to_concurrency: false,
  base_commit: repaired.state.base_commit,
  github_main_mutated: false,
  production_deploy_performed: false,
  secrets_printed: false,
}, null, 2));
