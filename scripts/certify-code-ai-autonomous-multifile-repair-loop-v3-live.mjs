import process from "node:process";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";
import { executeCodeAIMission } from "../lib/code/runtime/CodeAIMissionRuntime.js";

loadAvantiqoEnv();

const CONTRACT = "AVANTIQO_CODE_AUTONOMOUS_MULTIFILE_REPAIR_LOOP_LIVE_CERTIFICATION_V3";
const ENGINE_CONTRACT = "AVANTIQO_CODE_ENGINE_V1";
const FOUNDATION_MODEL = "Qwen/Qwen3-Coder-30B-A3B-Instruct";
const RUNTIME_MODEL = "Qwen/Qwen3-Coder-30B-A3B-Instruct-FP8";
const EXPECTED_QUANTIZATION = "fp8";
const EXPECTED_SERVING_RUNTIME = "vllm";
const FIXTURE_DIR = "tests/fixtures/code-ai-autonomous-multifile";
const HELPER = `${FIXTURE_DIR}/normalize-money.mjs`;
const SUMMARY = `${FIXTURE_DIR}/invoice-summary.mjs`;
const VERIFIER = "scripts/code-ai-autonomous-multifile-fixture-test.mjs";
const ALLOWED_FILES = Object.freeze([HELPER, SUMMARY]);
const API_BASE = "https://api.runpod.ai/v2";
const MAX_CONCURRENCY_REPLANS = 4;
const MAX_NEW_INFERENCES = 1;
const PROGRESS_INTERVAL_MS = 15_000;

function text(value) {
  return String(value ?? "").trim();
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function progress(event, details = {}) {
  console.log(JSON.stringify({
    event: `AVANTIQO_CODE_AUTONOMOUS_MULTIFILE_REPAIR_LOOP_V3_${event}`,
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
      error: text(error?.message || error).slice(0, 800),
    });
    throw error;
  } finally {
    clearInterval(timer);
  }
}

function cleanJson(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
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

const endpointId = text(process.env.RUNPOD_AVANTIQO_CODE_ENDPOINT_ID);
const codeKey = text(process.env.RUNPOD_AVANTIQO_CODE_API_KEY);
const genericKey = text(process.env.RUNPOD_API_KEY);
const managementKey = text(process.env.RUNPOD_MANAGEMENT_API_KEY);
const apiKey = codeKey || genericKey || managementKey;
const previousJobId = text(
  process.argv[2] || process.env.AVANTIQO_CODE_AUTONOMOUS_MULTIFILE_V3_PREVIOUS_JOB_ID,
);
const repositoryUrl = process.env.AVANTIQO_CODE_SANDBOX_REPOSITORY || "https://github.com/churchillkaron/churchill-control-new";
const ref = process.env.AVANTIQO_CODE_SANDBOX_REF || "main";

if (!endpointId) throw new Error("RUNPOD_AVANTIQO_CODE_ENDPOINT_ID_REQUIRED");
if (!apiKey) {
  throw new Error(
    "RUNPOD_AVANTIQO_CODE_API_KEY_OR_RUNPOD_API_KEY_OR_RUNPOD_MANAGEMENT_API_KEY_REQUIRED",
  );
}
if (!previousJobId) {
  throw new Error("AVANTIQO_CODE_AUTONOMOUS_MULTIFILE_V3_PREVIOUS_JOB_ID_REQUIRED");
}

function assertWorkerOutput(output = {}) {
  if (text(output.provider) !== "avantiqo-code") throw new Error("CODE_AI_AUTONOMOUS_MULTIFILE_PROVIDER_MISMATCH");
  if (text(output.engine_contract) !== ENGINE_CONTRACT) throw new Error("CODE_AI_AUTONOMOUS_MULTIFILE_ENGINE_CONTRACT_MISMATCH");
  if (text(output.foundation_model) !== FOUNDATION_MODEL) throw new Error("CODE_AI_AUTONOMOUS_MULTIFILE_FOUNDATION_MODEL_MISMATCH");
  if (text(output.runtime_model) !== RUNTIME_MODEL) throw new Error("CODE_AI_AUTONOMOUS_MULTIFILE_RUNTIME_MODEL_MISMATCH");
  if (text(output.quantization).toLowerCase() !== EXPECTED_QUANTIZATION) throw new Error("CODE_AI_AUTONOMOUS_MULTIFILE_QUANTIZATION_MISMATCH");
  if (text(output.serving_runtime).toLowerCase() !== EXPECTED_SERVING_RUNTIME) throw new Error("CODE_AI_AUTONOMOUS_MULTIFILE_SERVING_RUNTIME_MISMATCH");
  if (output.raw_reasoning_persisted !== false) throw new Error("CODE_AI_AUTONOMOUS_MULTIFILE_REASONING_BOUNDARY_FAILED");
}

function parseRepair(output = {}, { requireSemanticChecks = false } = {}) {
  assertWorkerOutput(output);
  const repair = cleanJson(output.result);
  const files = list(repair?.files);
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
    if (!byPath.has(path)) throw new Error(`CODE_AI_AUTONOMOUS_MULTIFILE_MISSING_PATH:${path}`);
  }

  const semanticChecks = repair?.semantic_checks && typeof repair.semantic_checks === "object"
    ? repair.semantic_checks
    : {};
  if (requireSemanticChecks) {
    if (semanticChecks.raw_validity_separate_from_normalized_value !== true) {
      throw new Error("CODE_AI_AUTONOMOUS_MULTIFILE_RAW_VALIDITY_CHECK_REQUIRED");
    }
    if (semanticChecks.invalid_fallback_not_counted !== true) {
      throw new Error("CODE_AI_AUTONOMOUS_MULTIFILE_INVALID_FALLBACK_CHECK_REQUIRED");
    }
    if (semanticChecks.verifier_authoritative !== true) {
      throw new Error("CODE_AI_AUTONOMOUS_MULTIFILE_VERIFIER_AUTHORITY_CHECK_REQUIRED");
    }
  }

  return {
    diagnosisPresent: Boolean(text(repair?.diagnosis)),
    semanticChecks,
    files: ALLOWED_FILES.map((path) => ({ path, content: byPath.get(path) })),
  };
}

async function statusJob(jobId) {
  const response = await fetch(
    `${API_BASE}/${encodeURIComponent(endpointId)}/status/${encodeURIComponent(jobId)}`,
    {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
      signal: AbortSignal.timeout(30_000),
    },
  );
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
    throw new Error(`CODE_AI_AUTONOMOUS_MULTIFILE_PREVIOUS_JOB_NOT_COMPLETED:${status || "UNKNOWN"}`);
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

function evidenceForOperation(state, operationId, action = null) {
  return list(state?.evidence).find(
    (item) => item?.operation_id === operationId && (!action || item?.action === action),
  ) || null;
}

function failureForOperation(state, operationId) {
  return list(state?.failures).find((item) => item?.operation_id === operationId) || null;
}

async function replayPreviousRepair(previousRepair) {
  const result = await executeCodeAIMission({
    objective: "Replay the already-completed second Avantiqo-owned multi-file repair in an isolated sandbox, preserve the exact verifier evidence, and do not mutate GitHub main.",
    repository_url: repositoryUrl,
    ref,
    operations: [
      {
        id: "v3_inspect",
        action: "inspect",
        description: "Establish current repository baseline.",
        input: {},
      },
      {
        id: "v3_read_verifier",
        action: "read",
        description: "Read the exact unchanged multi-file verifier.",
        input: { file_path: VERIFIER, start_line: 1, end_line: 260 },
      },
      {
        id: "v3_apply_previous",
        action: "apply_files",
        description: "Apply only the two files returned by the completed second repair job.",
        input: { files: previousRepair.files },
      },
      {
        id: "v3_verify_previous",
        action: "verify",
        description: "Run the exact verifier and retain the complete failure evidence.",
        input: { command: "node", args: [VERIFIER], cwd: "." },
      },
      {
        id: "v3_diff_previous",
        action: "diff",
        description: "Capture the previous repair diff if verification unexpectedly succeeds.",
        input: {},
      },
    ],
  });
  return result;
}

async function submitSemanticCorrection({ previousRepair, verifierContent, failure }) {
  progress("CORRECTIVE_RUNPOD_SUBMIT_START", {
    capability: "ai.code.debug",
    new_inference_ordinal: 1,
    maximum_new_inferences: MAX_NEW_INFERENCES,
  });
  const previousByPath = new Map(previousRepair.files.map((file) => [file.path, file.content]));
  const failureResult = failure?.result && typeof failure.result === "object" ? failure.result : {};
  const submit = await fetch(`${API_BASE}/${encodeURIComponent(endpointId)}/run`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
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
        usage_id: `code-autonomous-multifile-v3-${Date.now()}`,
        instruction: [
          "Return exactly one JSON object and no markdown.",
          "This is a verifier-driven correction of your already-completed second two-file repair. The unchanged verifier is the executable authority.",
          `Allowed file 1: ${HELPER}`,
          previousByPath.get(HELPER),
          `Allowed file 2: ${SUMMARY}`,
          previousByPath.get(SUMMARY),
          `Verifier: ${VERIFIER}`,
          verifierContent,
          "Exact verifier failure after the previous repair:",
          JSON.stringify({
            message: failure?.message || null,
            exit_code: failureResult.exit_code ?? null,
            stdout: failureResult.stdout || "",
            stderr: failureResult.stderr || "",
          }),
          "Observed semantic contradiction:",
          "- normalizeMoney intentionally maps invalid input to the fallback number 0.",
          "- 0 is itself finite, so Number.isFinite(normalizeMoney(raw)) cannot distinguish an invalid raw value from a valid numeric zero.",
          "- Therefore validity/classification must be computed from the raw input conversion, or from a separate raw-validity predicate, before the fallback-normalized value is used for aggregation.",
          "General repair rule: when a transformation collapses invalid input into a valid-looking sentinel/default, never infer original validity from the transformed sentinel; preserve source validity separately.",
          "Required behavior:",
          "- numeric strings such as 12.50 normalize to 12.5.",
          "- finite numbers remain finite numbers.",
          "- invalid values normalize to 0.",
          "- summarizeInvoice reads line.total.",
          "- total includes only finite numeric conversions.",
          "- valid_line_count counts only rows whose RAW line.total converts to a finite number; invalid values that normalize to 0 must not increase the count.",
          "Return complete final contents for BOTH allowed files.",
          `Required JSON shape: {\"files\":[{\"path\":\"${HELPER}\",\"content\":\"complete final file\"},{\"path\":\"${SUMMARY}\",\"content\":\"complete final file\"}],\"diagnosis\":\"concise evidence-based diagnosis\",\"semantic_checks\":{\"raw_validity_separate_from_normalized_value\":true,\"invalid_fallback_not_counted\":true,\"verifier_authoritative\":true}}`,
          "Do not change any other file. Do not expose chain-of-thought.",
        ].join("\n\n"),
        structured_specification: {
          certification_contract: CONTRACT,
          repair_iteration: 3,
          previous_provider_job_id: previousJobId,
          allowed_files: ALLOWED_FILES,
          required_changed_file_count: 2,
          verifier: VERIFIER,
          verifier_failure_exit_code: failureResult.exit_code ?? null,
          semantic_invariant: "SOURCE_VALIDITY_MUST_NOT_BE_INFERRED_FROM_COLLAPSED_NORMALIZED_SENTINEL",
          maximum_new_inferences: MAX_NEW_INFERENCES,
          response_style: "strict_json",
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
  progress("CORRECTIVE_RUNPOD_JOB_SUBMITTED", { job_id: jobId });

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
      progress("CORRECTIVE_RUNPOD_JOB_STATUS", {
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

  const parsed = parseRepair(body.output || {}, { requireSemanticChecks: true });
  progress("CORRECTIVE_REPAIR_READY", {
    job_id: jobId,
    diagnosis_present: parsed.diagnosisPresent,
    file_count: parsed.files.length,
    semantic_checks_passed: true,
  });
  return {
    jobId,
    output: body.output || {},
    ...parsed,
  };
}

function correctiveOperations(files) {
  return [
    {
      id: "v3_apply_corrective_repair",
      action: "apply_files",
      description: "Apply the verifier-driven semantic correction in the isolated workspace.",
      input: { files },
    },
    {
      id: "v3_verify_corrective_repair",
      action: "verify",
      description: "Run the unchanged multi-file verifier after the semantic correction.",
      input: { command: "node", args: [VERIFIER], cwd: "." },
    },
    {
      id: "v3_diff_corrective_repair",
      action: "diff",
      description: "Capture the final verified two-file repair diff.",
      input: {},
    },
  ];
}

async function executeCorrectionWithConcurrencyRecovery({ resumeState, files }) {
  let concurrencyReplans = 0;
  let result = await withHeartbeat("sandbox_apply_corrective_repair", () => executeCodeAIMission({
    objective: "Use exact verifier evidence to correct the already-failed multi-file repair, preserve raw-input validity separately from normalized fallback values, verify the unchanged test, and produce a bounded two-file diff without mutating GitHub main.",
    repository_url: repositoryUrl,
    ref,
    resume_state: resumeState,
    operations: correctiveOperations(files),
  }));

  while (result.status === "replan_required" && concurrencyReplans < MAX_CONCURRENCY_REPLANS) {
    concurrencyReplans += 1;
    progress("CONCURRENCY_REPLAN", {
      attempt: concurrencyReplans,
      reason: result.reason || null,
      additional_inference_submitted: false,
    });
    result = await withHeartbeat(`sandbox_apply_corrective_repair_replan_${concurrencyReplans}`, () => executeCodeAIMission({
      objective: "Use exact verifier evidence to correct the already-failed multi-file repair, preserve raw-input validity separately from normalized fallback values, verify the unchanged test, and produce a bounded two-file diff without mutating GitHub main.",
      repository_url: repositoryUrl,
      ref,
      resume_state: result.state,
      operations: correctiveOperations(files),
    }));
  }

  if (result.status === "replan_required") {
    throw new Error(`CODE_AI_AUTONOMOUS_MULTIFILE_REPLAN_LIMIT_EXCEEDED:${concurrencyReplans}`);
  }
  return { result, concurrencyReplans };
}

function assertCertifiedResult(result) {
  if (!result?.success || result.status !== "completed") {
    const failure = failureForOperation(result?.state, "v3_verify_corrective_repair");
    const stderr = text(failure?.result?.stderr).slice(0, 2000);
    throw new Error(
      `CODE_AI_AUTONOMOUS_MULTIFILE_V3_MISSION_FAILED:${result?.reason || result?.status || "unknown"}:${stderr}`,
    );
  }
  const changed = [...new Set(list(result.state?.files_changed))].sort();
  const expected = [...ALLOWED_FILES].sort();
  if (JSON.stringify(changed) !== JSON.stringify(expected)) {
    throw new Error(`CODE_AI_AUTONOMOUS_MULTIFILE_SCOPE_VIOLATION:${changed.join(",")}`);
  }
  const passed = list(result.state?.verification).some(
    (item) => item?.operation_id === "v3_verify_corrective_repair" && item?.passed === true,
  );
  if (!passed) throw new Error("CODE_AI_AUTONOMOUS_MULTIFILE_VERIFICATION_EVIDENCE_REQUIRED");
  const patch = String(result.state?.patch || "");
  for (const path of ALLOWED_FILES) {
    if (!patch.includes(path)) throw new Error(`CODE_AI_AUTONOMOUS_MULTIFILE_DIFF_EVIDENCE_REQUIRED:${path}`);
  }
  return changed;
}

progress("START", {
  contract: CONTRACT,
  ref,
  previous_provider_job_id: previousJobId,
  maximum_new_inferences: MAX_NEW_INFERENCES,
  provider_job_submitted: false,
  production_deploy_performed: false,
  secrets_printed: false,
});

const previousRepair = await withHeartbeat("adopt_completed_second_repair", () => adoptCompletedRepair(previousJobId));
const replay = await withHeartbeat("sandbox_replay_second_repair", () => replayPreviousRepair(previousRepair));

if (replay.success && replay.status === "completed") {
  const changed = [...new Set(list(replay.state?.files_changed))].sort();
  console.log(JSON.stringify({
    success: true,
    contract: CONTRACT,
    previous_provider_job_id: previousJobId,
    corrective_provider_job_id: null,
    previous_inference_reused_not_resubmitted: true,
    new_inference_count: 0,
    historical_inference_count: 2,
    semantic_correction_required: false,
    verification_passed: true,
    changed_files: changed,
    github_main_mutated: false,
    production_deploy_performed: false,
    secrets_printed: false,
  }, null, 2));
  process.exit(0);
}

if (
  replay.status !== "repair_required" ||
  !text(replay.reason).startsWith("CODE_AI_VERIFICATION_FAILED:")
) {
  throw new Error(`CODE_AI_AUTONOMOUS_MULTIFILE_V3_UNEXPECTED_REPLAY_STATUS:${replay.reason || replay.status}`);
}

const verifierEvidence = evidenceForOperation(replay.state, "v3_read_verifier", "read");
const verifierContent = String(verifierEvidence?.result?.content || "");
if (!verifierContent) throw new Error("CODE_AI_AUTONOMOUS_MULTIFILE_VERIFIER_READ_EVIDENCE_REQUIRED");
const previousFailure = failureForOperation(replay.state, "v3_verify_previous");
if (!previousFailure?.result) {
  throw new Error("CODE_AI_AUTONOMOUS_MULTIFILE_EXACT_FAILURE_EVIDENCE_REQUIRED");
}
progress("PREVIOUS_FAILURE_PRESERVED", {
  provider_job_id: previousJobId,
  failure_message: previousFailure.message,
  failure_exit_code: previousFailure.result?.exit_code ?? null,
  stderr_present: Boolean(text(previousFailure.result?.stderr)),
  new_inference_allowed: true,
});

const correction = await withHeartbeat("owned_semantic_correction_from_exact_failure", () => submitSemanticCorrection({
  previousRepair,
  verifierContent,
  failure: previousFailure,
}));
const corrected = await executeCorrectionWithConcurrencyRecovery({
  resumeState: replay.state,
  files: correction.files,
});
const changed = assertCertifiedResult(corrected.result);

progress("CERTIFICATION_COMPLETE", {
  previous_provider_job_id: previousJobId,
  corrective_provider_job_id: correction.jobId,
  new_inference_count: 1,
  historical_inference_count: 3,
  concurrency_replans_recovered: corrected.concurrencyReplans,
  changed_files: changed,
});

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  provider: "avantiqo-code",
  engine_contract: ENGINE_CONTRACT,
  foundation_model: FOUNDATION_MODEL,
  runtime_model: RUNTIME_MODEL,
  serving_runtime: EXPECTED_SERVING_RUNTIME,
  quantization: EXPECTED_QUANTIZATION,
  previous_provider_job_id: previousJobId,
  corrective_provider_job_id: correction.jobId,
  previous_inference_reused_not_resubmitted: true,
  previous_failure_preserved_with_exact_stderr: true,
  semantic_invariant: "SOURCE_VALIDITY_MUST_NOT_BE_INFERRED_FROM_COLLAPSED_NORMALIZED_SENTINEL",
  semantic_checks_passed: true,
  new_inference_count: 1,
  maximum_new_inferences: MAX_NEW_INFERENCES,
  historical_inference_count: 3,
  additional_inference_submitted_due_to_concurrency: false,
  concurrency_replans_recovered: corrected.concurrencyReplans,
  isolated_multifile_repair_applied: true,
  verification_passed: true,
  diff_verified: true,
  changed_files: changed,
  github_main_mutated: false,
  production_deploy_performed: false,
  secrets_printed: false,
}, null, 2));
