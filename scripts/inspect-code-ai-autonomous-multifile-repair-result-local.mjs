import process from "node:process";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";
import { executeCodeAIMission } from "../lib/code/runtime/CodeAIMissionRuntime.js";

loadAvantiqoEnv();

const CONTRACT = "AVANTIQO_CODE_AUTONOMOUS_MULTIFILE_REPAIR_RESULT_INSPECTOR_V1";
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

function text(value) {
  return String(value ?? "").trim();
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

const endpointId = text(process.env.RUNPOD_AVANTIQO_CODE_ENDPOINT_ID);
const codeKey = text(process.env.RUNPOD_AVANTIQO_CODE_API_KEY);
const genericKey = text(process.env.RUNPOD_API_KEY);
const managementKey = text(process.env.RUNPOD_MANAGEMENT_API_KEY);
const apiKey = codeKey || genericKey || managementKey;
const jobId = text(process.argv[2] || process.env.AVANTIQO_CODE_AUTONOMOUS_MULTIFILE_RESULT_JOB_ID);
const repositoryUrl = process.env.AVANTIQO_CODE_SANDBOX_REPOSITORY || "https://github.com/churchillkaron/churchill-control-new";
const ref = process.env.AVANTIQO_CODE_SANDBOX_REF || "main";

if (!endpointId) throw new Error("RUNPOD_AVANTIQO_CODE_ENDPOINT_ID_REQUIRED");
if (!apiKey) {
  throw new Error(
    "RUNPOD_AVANTIQO_CODE_API_KEY_OR_RUNPOD_API_KEY_OR_RUNPOD_MANAGEMENT_API_KEY_REQUIRED",
  );
}
if (!jobId) throw new Error("AVANTIQO_CODE_AUTONOMOUS_MULTIFILE_RESULT_JOB_ID_REQUIRED");

const response = await fetch(
  `${API_BASE}/${encodeURIComponent(endpointId)}/status/${encodeURIComponent(jobId)}`,
  {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  },
);
const job = await response.json().catch(() => ({}));
if (!response.ok) throw new Error(`RUNPOD_STATUS_HTTP_${response.status}`);
if (text(job?.status).toUpperCase() !== "COMPLETED") {
  throw new Error(`AVANTIQO_CODE_AUTONOMOUS_MULTIFILE_RESULT_JOB_NOT_COMPLETED:${text(job?.status) || "UNKNOWN"}`);
}

const output = job?.output && typeof job.output === "object" ? job.output : {};
if (text(output.provider) !== "avantiqo-code") throw new Error("CODE_AI_AUTONOMOUS_MULTIFILE_PROVIDER_MISMATCH");
if (text(output.engine_contract) !== ENGINE_CONTRACT) throw new Error("CODE_AI_AUTONOMOUS_MULTIFILE_ENGINE_CONTRACT_MISMATCH");
if (text(output.foundation_model) !== FOUNDATION_MODEL) throw new Error("CODE_AI_AUTONOMOUS_MULTIFILE_FOUNDATION_MODEL_MISMATCH");
if (text(output.runtime_model) !== RUNTIME_MODEL) throw new Error("CODE_AI_AUTONOMOUS_MULTIFILE_RUNTIME_MODEL_MISMATCH");
if (text(output.quantization).toLowerCase() !== EXPECTED_QUANTIZATION) throw new Error("CODE_AI_AUTONOMOUS_MULTIFILE_QUANTIZATION_MISMATCH");
if (text(output.serving_runtime).toLowerCase() !== EXPECTED_SERVING_RUNTIME) throw new Error("CODE_AI_AUTONOMOUS_MULTIFILE_SERVING_RUNTIME_MISMATCH");
if (output.raw_reasoning_persisted !== false) throw new Error("CODE_AI_AUTONOMOUS_MULTIFILE_REASONING_BOUNDARY_FAILED");

const repair = cleanJson(output.result);
const rawFiles = Array.isArray(repair?.files) ? repair.files : [];
if (rawFiles.length !== ALLOWED_FILES.length) {
  throw new Error(`CODE_AI_AUTONOMOUS_MULTIFILE_FILE_COUNT_INVALID:${rawFiles.length}`);
}
const byPath = new Map();
for (const file of rawFiles) {
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
const files = ALLOWED_FILES.map((path) => ({ path, content: byPath.get(path) }));

const mission = await executeCodeAIMission({
  objective: "Replay one already-completed Avantiqo Code multi-file repair in an isolated sandbox and expose exact verification evidence without submitting another model inference or mutating GitHub main.",
  repository_url: repositoryUrl,
  ref,
  operations: [
    {
      id: "result_inspect",
      action: "inspect",
      description: "Establish current repository baseline.",
      input: {},
    },
    {
      id: "result_apply",
      action: "apply_files",
      description: "Apply only the two files returned by the completed owned Code job.",
      input: { files },
    },
    {
      id: "result_verify",
      action: "verify",
      description: "Run the exact multi-file verifier and retain stdout/stderr.",
      input: { command: "node", args: [VERIFIER], cwd: "." },
    },
    {
      id: "result_diff",
      action: "diff",
      description: "Capture the generated two-file patch if verification succeeds.",
      input: {},
    },
  ],
});

const failure = (mission.state?.failures || []).find(
  (item) => item?.operation_id === "result_verify",
) || null;
const verification = (mission.state?.verification || []).find(
  (item) => item?.operation_id === "result_verify",
) || null;
const commandEvidence = mission.evidence || failure?.result || null;

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  mode: "READ_ONLY_DIAGNOSTIC",
  provider_job_submitted: false,
  provider_job_id: jobId,
  provider_job_status: text(job?.status).toUpperCase(),
  endpoint_mutation_performed: false,
  queue_mutation_performed: false,
  github_main_mutated: false,
  production_deploy_performed: false,
  secrets_printed: false,
  credential_source: codeKey ? "CODE" : genericKey ? "GENERIC" : "MANAGEMENT_FALLBACK",
  provider: text(output.provider),
  engine_contract: text(output.engine_contract),
  foundation_model: text(output.foundation_model),
  runtime_model: text(output.runtime_model),
  serving_runtime: text(output.serving_runtime),
  quantization: text(output.quantization),
  raw_reasoning_persisted: output.raw_reasoning_persisted,
  diagnosis_present: Boolean(text(repair?.diagnosis)),
  generated_files: files,
  sandbox_status: mission.status,
  sandbox_reason: mission.reason || null,
  verification_passed: verification?.passed === true,
  verification_failure: failure,
  verification_command_evidence: commandEvidence,
  patch: mission.state?.patch || null,
}, null, 2));
