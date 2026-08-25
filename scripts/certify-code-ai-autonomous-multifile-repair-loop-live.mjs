import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvFile } from "node:process";
import { executeCodeAIMission } from "../lib/code/runtime/CodeAIMissionRuntime.js";

const CONTRACT = "AVANTIQO_CODE_AUTONOMOUS_MULTIFILE_REPAIR_LOOP_LIVE_CERTIFICATION_V2";
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
const MAX_TOTAL_INFERENCES = 2;
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
const RESUME_JOB_ID = text(
  process.argv[2] || process.env.AVANTIQO_CODE_AUTONOMOUS_MULTIFILE_RESUME_JOB_ID,
);

if (!ENDPOINT) throw new Error("RUNPOD_AVANTIQO_CODE_ENDPOINT_ID_REQUIRED");
if (!API_KEY) throw new Error("RUNPOD_AVANTIQO_CODE_API_KEY_OR_RUNPOD_API_KEY_REQUIRED");
if (!RESUME_JOB_ID) throw new Error("AVANTIQO_CODE_AUTONOMOUS_MULTIFILE_RESUME_JOB_ID_REQUIRED");

function progress(event, details = {}) {
  console.log(JSON.stringify({
    event: `AVANTIQO_CODE_AUTONOMOUS_MULTIFILE_REPAIR_LOOP_${event}`,
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
      error: text(error?.message || error).slice(0, 700),
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
  if (start < 0 || end <= start) {
    throw new Error("CODE_AI_AUTONOMOUS_MULTIFILE_JSON_REQUIRED");
  }
  return JSON.parse(raw.slice(start, end + 1));
}

function assertWorkerOutput(output = {}) {
  if (text(output.provider) !== "avantiqo-code") {
    throw new Error("CODE_AI_AUTONOMOUS_MULTIFILE_PROVIDER_MISMATCH");
  }
  if (text(output.engine_contract) !== ENGINE_CONTRACT) {
    throw new Error("CODE_AI_AUTONOMOUS_MULTIFILE_ENGINE_CONTRACT_MISMATCH");
  }
  if (text(output.foundation_model) !== FOUNDATION_MODEL) {
    throw new Error("CODE_AI_AUTONOMOUS_MULTIFILE_FOUNDATION_MODEL_MISMATCH");
  }
  if (text(output.runtime_model) !== RUNTIME_MODEL) {
    throw new Error("CODE_AI_AUTONOMOUS_MULTIFILE_RUNTIME_MODEL_MISMATCH");
  }
  if (text(output.quantization).toLowerCase() !== EXPECTED_QUANTIZATION) {
    throw new Error("CODE_AI_AUTONOMOUS_MULTIFILE_QUANTIZATION_MISMATCH");
  }
  if (text(output.serving_runtime).toLowerCase() !== EXPECTED_SERVING_RUNTIME) {
    throw new Error("CODE_AI_AUTONOMOUS_MULTIFILE_SERVING_RUNTIME_MISMATCH");
  }
  if (output.raw_reasoning_persisted !== false) {
    throw new Error("CODE_AI_AUTONOMOUS_MULTIFILE_REASONING_BOUNDARY_FAILED");
  }
}

function parseRepair(output = {}) {
  assertWorkerOutput(output);
  const repair = cleanJson(output.result);
  const files = Array.isArray(repair?.files) ? repair.files : [];
  if (files.length !== ALLOWED_FILES.length) {
    throw new Error(`CODE_AI_AUTONOMOUS_MULTIFILE_FILE_COUNT_INVALID:${files.length}`);
  }
  const byPath = new Map();
  for (const file of files) {
    const path = text(file?.path);
    const content = String(file?.content ?? "");
    if (!ALLOWED_FILES.includes(path)) {
      throw new Error(`CODE_AI_AUTONOMOUS_MULTIFILE_PATH_INVALID:${path || "missing"}`);
    }
    if (!content.trim()) {
      throw new Error(`CODE_AI_AUTONOMOUS_MULTIFILE_CONTENT_REQUIRED:${path}`);
    }
    if (byPath.has(path)) {
      throw new Error(`CODE_AI_AUTONOMOUS_MULTIFILE_DUPLICATE_PATH:${path}`);
    }
    byPath.set(path, content);
  }
  for (const path of ALLOWED_FILES) {
    if (!byPath.has(path)) {
      throw new Error(`CODE_AI_AUTONOMOUS_MULTIFILE_MISSING_PATH:${path}`);
    }
  }
  return {
    diagnosisPresent: Boolean(text(repair?.diagnosis)),
    files: ALLOWED_FILES.map((path) => ({ path, content: byPath.get(path) })),
  };
}

async function statusJob(jobId) {
  const response = await fetch(`${API_BASE}/${ENDPOINT}/status/${encodeURIComponent(jobId)}`, {
    headers: { Authorization: `Bearer ${API_KEY}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`RUNPOD_STATUS_HTTP_${response.status}`);
  return body;
}

async function adoptCompletedRepair(jobId) {
  progress("ADOPT_EXISTING_JOB", {
    job_id: jobId,
    new_inference_submitted: false,
  });
  const body = await statusJob(jobId);
  const status = text(body?.status).toUpperCase();
  if (status !== "COMPLETED") {
    throw new Error(`CODE_AI_AUTONOMOUS_MULTIFILE_RESUME_JOB_NOT_COMPLETED:${status || "UNKNOWN"}`);
  }
  const parsed = parseRepair(body.output || {});
  progress("EXISTING_REPAIR_ADOPTED", {
    job_id: jobId,
    diagnosis_present: parsed.diagnosisPresent,
    file_count: parsed.files.length,
  });
  return {
    jobId,
    output: body.output || {},
    ...parsed,
  };
}

async function submitFollowupRepair({ previousFiles, verifierContent, failure }) {
  progress("FOLLOWUP_RUNPOD_SUBMIT_START", {
    capability: "ai.code.debug",
    inference_ordinal: 2,
    maximum_total_inferences: MAX_TOTAL_INFERENCES,
  });
  const previousByPath = new Map(previousFiles.map((file) => [file.path, file.content]));
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
        usage_id: `code-autonomous-multifile-repair-loop-${Date.now()}`,
        instruction: [
          "Return exactly one JSON object and no markdown.",
          "Your first two-file repair was applied in an isolated repository sandbox and the real verifier still failed.",
          "Use the observed verifier failure to repair the previous patch. Do not repeat the same defect.",
          `Allowed file 1: ${HELPER}`,
          previousByPath.get(HELPER),
          `Allowed file 2: ${SUMMARY}`,
          previousByPath.get(SUMMARY),
          `Observed verifier source: ${VERIFIER}`,
          verifierContent,
          "Observed verifier failure after your first repair:",
          JSON.stringify(failure),
          "Required behavior:",
          "- normalizeMoney must convert numeric strings with Number(value), preserve finite numbers, and return 0 for invalid values.",
          "- summarizeInvoice must read line.total, sum only finite normalized totals, and count only inputs whose raw line.total converts to a finite number.",
          "- invalid values normalize to zero but MUST NOT increase valid_line_count.",
          "Return complete final contents for BOTH allowed files, even if only one needs a semantic correction.",
          `Required JSON shape: {\"files\":[{\"path\":\"${HELPER}\",\"content\":\"complete final file\"},{\"path\":\"${SUMMARY}\",\"content\":\"complete final file\"}],\"diagnosis\":\"concise failure-based diagnosis\"}`,
          "Do not change any other file. Do not expose chain-of-thought.",
        ].join("\n\n"),
        structured_specification: {
          certification_contract: CONTRACT,
          repair_iteration: 2,
          previous_provider_job_id: RESUME_JOB_ID,
          allowed_files: ALLOWED_FILES,
          required_changed_file_count: 2,
          verifier: VERIFIER,
          response_style: "strict_json",
          maximum_total_inferences: MAX_TOTAL_INFERENCES,
        },
      },
    }),
    signal: AbortSignal.timeout(30_000),
  });
  let body = await submit.json().catch(() => ({}));
  if (!submit.ok) {
    throw new Error(`RUNPOD_SUBMIT_HTTP_${submit.status}:${text(body?.error || body?.message)}`);
  }
  const jobId = text(body?.id);
  if (!jobId) throw new Error("RUNPOD_JOB_ID_REQUIRED");
  progress("FOLLOWUP_RUNPOD_JOB_SUBMITTED", { job_id: jobId });

  const timeoutMs = Math.max(
    60_000,
    Math.min(20 * 60_000, Number(process.env.AVANTIQO_CODE_AUTONOMOUS_CERT_TIMEOUT_MS || 15 * 60_000)),
  );
  const startedAt = Date.now();
  const deadline = startedAt + timeoutMs;
  let lastStatus = null;
  let lastProgressAt = 0;
  while (Date.now() < deadline) {
    const status = text(body?.status).toUpperCase() || "UNKNOWN";
    if (status !== lastStatus || Date.now() - lastProgressAt >= PROGRESS_INTERVAL_MS) {
      progress("FOLLOWUP_RUNPOD_JOB_STATUS", {
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
    body = await statusJob(jobId);
  }
  if (text(body?.status).toUpperCase() !== "COMPLETED") {
    throw new Error(`RUNPOD_JOB_TIMEOUT:${jobId}`);
  }
  const parsed = parseRepair(body.output || {});
  progress("FOLLOWUP_REPAIR_READY", {
    job_id: jobId,
    diagnosis_present: parsed.diagnosisPresent,
    file_count: parsed.files.length,
  });
  return {
    jobId,
    output: body.output || {},
    ...parsed,
  };
}

function repairOperations(files, prefix) {
  return [
    {
      id: `${prefix}_apply`,
      action: "apply_files",
      description: "Apply the owned two-file repair in the isolated workspace.",
      input: { files },
    },
    {
      id: `${prefix}_verify`,
      action: "verify",
      description: "Run the real multi-file verifier after the repair.",
      input: { command: "node", args: [VERIFIER], cwd: "." },
    },
    {
      id: `${prefix}_diff`,
      action: "diff",
      description: "Capture the final two-file repair diff.",
      input: {},
    },
  ];
}

async function executeRepairWithConcurrencyRecovery({ objective, resumeState, files, prefix }) {
  let concurrencyReplans = 0;
  let result = await withHeartbeat(`sandbox_${prefix}`, () => executeCodeAIMission({
    objective,
    repository_url: REPOSITORY,
    ref: REF,
    resume_state: resumeState,
    operations: repairOperations(files, prefix),
  }));
  while (result.status === "replan_required" && concurrencyReplans < MAX_CONCURRENCY_REPLANS) {
    concurrencyReplans += 1;
    progress("CONCURRENCY_REPLAN", {
      stage: prefix,
      attempt: concurrencyReplans,
      reason: result.reason || null,
    });
    result = await withHeartbeat(`sandbox_${prefix}_replan_${concurrencyReplans}`, () => executeCodeAIMission({
      objective,
      repository_url: REPOSITORY,
      ref: REF,
      resume_state: result.state,
      operations: repairOperations(files, prefix),
    }));
  }
  if (result.status === "replan_required") {
    throw new Error(`CODE_AI_AUTONOMOUS_MULTIFILE_REPLAN_LIMIT_EXCEEDED:${prefix}:${concurrencyReplans}`);
  }
  return { result, concurrencyReplans };
}

function failureForOperation(state, operationId) {
  return (state?.failures || []).find((item) => item?.operation_id === operationId) || null;
}

function assertCertifiedResult(result) {
  if (!result?.success || result.status !== "completed") {
    throw new Error(`CODE_AI_AUTONOMOUS_MULTIFILE_MISSION_FAILED:${result?.reason || result?.status || "unknown"}`);
  }
  const changed = [...new Set(result.state?.files_changed || [])].sort();
  const expected = [...ALLOWED_FILES].sort();
  if (JSON.stringify(changed) !== JSON.stringify(expected)) {
    throw new Error(`CODE_AI_AUTONOMOUS_MULTIFILE_SCOPE_VIOLATION:${changed.join(",")}`);
  }
  const passed = (result.state?.verification || []).some((item) => item?.passed === true);
  if (!passed) throw new Error("CODE_AI_AUTONOMOUS_MULTIFILE_VERIFICATION_EVIDENCE_REQUIRED");
  const patch = String(result.state?.patch || "");
  for (const path of ALLOWED_FILES) {
    if (!patch.includes(path)) throw new Error(`CODE_AI_AUTONOMOUS_MULTIFILE_DIFF_EVIDENCE_REQUIRED:${path}`);
  }
  return changed;
}

const objective = "Observe the intentionally broken two-file invoice normalization fixture, use the already-completed Avantiqo-owned Code repair attempt, learn from a real verifier failure if that first patch is incomplete, perform at most one additional owned repair inference, verify the final behavior, and produce an evidence-backed two-file diff without mutating GitHub main.";

progress("START", {
  contract: CONTRACT,
  local_env_loaded: LOCAL_ENV_LOADED,
  ref: REF,
  adopted_provider_job_id: RESUME_JOB_ID,
  maximum_total_inferences: MAX_TOTAL_INFERENCES,
  production_deploy_performed: false,
});

const observed = await withHeartbeat("sandbox_observe_current_failure", () => executeCodeAIMission({
  objective,
  repository_url: REPOSITORY,
  ref: REF,
  operations: [
    { id: "loop_inspect", action: "inspect", description: "Establish current repository baseline.", input: {} },
    { id: "loop_read_helper", action: "read", description: "Read the broken money helper.", input: { file_path: HELPER, start_line: 1, end_line: 200 } },
    { id: "loop_read_summary", action: "read", description: "Read the broken invoice summary.", input: { file_path: SUMMARY, start_line: 1, end_line: 240 } },
    { id: "loop_read_verifier", action: "read", description: "Read the exact verifier contract.", input: { file_path: VERIFIER, start_line: 1, end_line: 260 } },
    { id: "loop_observe_failure", action: "verify", description: "Observe the current real verifier failure before applying the adopted repair.", input: { command: "node", args: [VERIFIER], cwd: "." } },
  ],
}));
if (observed.status !== "repair_required") {
  throw new Error(`CODE_AI_AUTONOMOUS_MULTIFILE_EXPECTED_INITIAL_FAILURE:${observed.status}`);
}
const verifierEvidence = (observed.state?.evidence || []).find(
  (item) => item?.operation_id === "loop_read_verifier" && item?.action === "read",
);
const verifierContent = String(verifierEvidence?.result?.content || "");
if (!verifierContent) throw new Error("CODE_AI_AUTONOMOUS_MULTIFILE_VERIFIER_READ_EVIDENCE_REQUIRED");

const firstRepair = await withHeartbeat("adopt_completed_first_repair", () => adoptCompletedRepair(RESUME_JOB_ID));
const firstExecution = await executeRepairWithConcurrencyRecovery({
  objective,
  resumeState: observed.state,
  files: firstRepair.files,
  prefix: "first_repair",
});

let finalExecution = firstExecution;
let followupRepair = null;
let firstRepairVerificationFailed = false;

if (!firstExecution.result.success) {
  const failedOperationId = "first_repair_verify";
  const failure = failureForOperation(firstExecution.result.state, failedOperationId);
  if (
    firstExecution.result.status !== "repair_required" ||
    !text(firstExecution.result.reason).startsWith("CODE_AI_VERIFICATION_FAILED:") ||
    !failure
  ) {
    throw new Error(
      `CODE_AI_AUTONOMOUS_MULTIFILE_FIRST_REPAIR_FAILED_UNEXPECTEDLY:${firstExecution.result.reason || firstExecution.result.status}`,
    );
  }
  firstRepairVerificationFailed = true;
  progress("FIRST_REPAIR_VERIFICATION_FAILED_AS_EVIDENCE", {
    provider_job_id: RESUME_JOB_ID,
    failure_message: text(failure.message).slice(0, 500),
    followup_inference_allowed: true,
  });

  followupRepair = await withHeartbeat("owned_followup_repair_from_failure", () => submitFollowupRepair({
    previousFiles: firstRepair.files,
    verifierContent,
    failure,
  }));
  finalExecution = await executeRepairWithConcurrencyRecovery({
    objective,
    resumeState: firstExecution.result.state,
    files: followupRepair.files,
    prefix: "followup_repair",
  });
}

const changed = assertCertifiedResult(finalExecution.result);
const totalInferenceCount = followupRepair ? 2 : 1;
progress("CERTIFICATION_COMPLETE", {
  adopted_provider_job_id: RESUME_JOB_ID,
  followup_provider_job_id: followupRepair?.jobId || null,
  total_inference_count: totalInferenceCount,
  first_repair_verification_failed: firstRepairVerificationFailed,
  changed_files: changed,
});

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  provider: finalExecution.result?.state ? "avantiqo-code" : null,
  foundation_model: FOUNDATION_MODEL,
  runtime_model: RUNTIME_MODEL,
  serving_runtime: EXPECTED_SERVING_RUNTIME,
  quantization: EXPECTED_QUANTIZATION,
  adopted_provider_job_id: RESUME_JOB_ID,
  followup_provider_job_id: followupRepair?.jobId || null,
  first_inference_reused_not_resubmitted: true,
  first_repair_verification_failed: firstRepairVerificationFailed,
  failure_driven_followup_repair_performed: Boolean(followupRepair),
  total_inference_count: totalInferenceCount,
  maximum_total_inferences: MAX_TOTAL_INFERENCES,
  additional_inference_submitted_due_to_concurrency: false,
  concurrency_replans_recovered:
    firstExecution.concurrencyReplans + (followupRepair ? finalExecution.concurrencyReplans : 0),
  isolated_repair_applied: true,
  verification_passed: true,
  diff_verified: true,
  changed_files: changed,
  base_commit: finalExecution.result.state?.base_commit || null,
  github_main_mutated: false,
  production_deploy_performed: false,
  secrets_printed: false,
}, null, 2));
