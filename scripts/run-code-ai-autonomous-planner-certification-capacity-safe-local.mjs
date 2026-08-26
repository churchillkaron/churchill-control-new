import process from "node:process";
import { spawnSync } from "node:child_process";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();

const CONTRACT = "AVANTIQO_CODE_AUTONOMOUS_PLANNER_CAPACITY_SAFE_RUNNER_V1";
const CODE_ENDPOINT_NAME = "avantiqo-code-v1";
const USABLE_CODE_WORKER_STATUSES = new Set([
  "INITIALIZING",
  "IDLE",
  "READY",
  "RUNNING",
]);

function text(value) {
  return String(value ?? "").trim();
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function parseJsonOutput(output, code) {
  const start = output.indexOf("{");
  const end = output.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error(code);
  return JSON.parse(output.slice(start, end + 1));
}

function runCapture(script) {
  const result = spawnSync(process.execPath, [script], {
    cwd: process.cwd(),
    env: process.env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `AVANTIQO_CODE_CERTIFICATION_PREFLIGHT_CHILD_FAILED:${script}:${result.status}`,
    );
  }
  const output = text(result.stdout);
  process.stdout.write(`${output}\n`);
  return output;
}

function runCertification() {
  const result = spawnSync(
    process.execPath,
    ["scripts/run-code-ai-autonomous-planner-certification-local.mjs"],
    {
      cwd: process.cwd(),
      env: process.env,
      stdio: "inherit",
    },
  );
  if (result.error) throw result.error;
  return Number.isInteger(result.status) ? result.status : 1;
}

if (text(process.env.NODE_ENV).toLowerCase() !== "development") {
  throw new Error("AVANTIQO_CODE_CERTIFICATION_DEVELOPMENT_ENV_REQUIRED");
}
if (text(process.env.AVANTIQO_CODE_PLANNER_SPEND_APPROVED).toUpperCase() !== "YES") {
  throw new Error("AVANTIQO_CODE_PLANNER_SPEND_APPROVAL_REQUIRED");
}

const codeDiagnosticOutput = runCapture("scripts/diagnose-avantiqo-code-runpod.mjs");
const codeDiagnostic = parseJsonOutput(
  codeDiagnosticOutput,
  "AVANTIQO_CODE_CERTIFICATION_CODE_DIAGNOSTIC_JSON_REQUIRED",
);

if (codeDiagnostic?.success !== true) {
  throw new Error("AVANTIQO_CODE_CERTIFICATION_CODE_ENDPOINT_NOT_READY");
}
if (
  codeDiagnostic?.mutation_performed === true ||
  codeDiagnostic?.provider_job_submitted === true ||
  codeDiagnostic?.generation_performed === true
) {
  throw new Error("AVANTIQO_CODE_CERTIFICATION_CODE_DIAGNOSTIC_MUST_BE_READ_ONLY");
}
if (text(codeDiagnostic?.endpoint?.name) !== CODE_ENDPOINT_NAME) {
  throw new Error(
    `AVANTIQO_CODE_CERTIFICATION_CODE_ENDPOINT_MISMATCH:${text(codeDiagnostic?.endpoint?.name) || "MISSING"}`,
  );
}
if (codeDiagnostic?.diagnosis?.queue_is_clean !== true) {
  throw new Error("AVANTIQO_CODE_CERTIFICATION_CODE_QUEUE_MUST_BE_CLEAN");
}
if (
  finite(codeDiagnostic?.health?.jobs?.in_queue, 0) !== 0 ||
  finite(codeDiagnostic?.health?.jobs?.in_progress, 0) !== 0
) {
  throw new Error("AVANTIQO_CODE_CERTIFICATION_CODE_EXECUTION_ALREADY_ACTIVE");
}
if (codeDiagnostic?.diagnosis?.template_resolved !== true) {
  throw new Error("AVANTIQO_CODE_CERTIFICATION_CODE_TEMPLATE_REQUIRED");
}
if (codeDiagnostic?.diagnosis?.persistent_network_volume_attached !== true) {
  throw new Error("AVANTIQO_CODE_CERTIFICATION_CODE_NETWORK_VOLUME_REQUIRED");
}
if (codeDiagnostic?.gpu_capacity?.bound_gpu_stock_reported_available !== true) {
  throw new Error("AVANTIQO_CODE_CERTIFICATION_BOUND_GPU_CAPACITY_UNAVAILABLE");
}

const accountDiagnosticOutput = runCapture(
  "scripts/diagnose-avantiqo-runpod-account-serverless-capacity-local.mjs",
);
const accountDiagnostic = parseJsonOutput(
  accountDiagnosticOutput,
  "AVANTIQO_CODE_CERTIFICATION_ACCOUNT_DIAGNOSTIC_JSON_REQUIRED",
);

if (text(accountDiagnostic?.mode) !== "READ_ONLY") {
  throw new Error("AVANTIQO_CODE_CERTIFICATION_ACCOUNT_DIAGNOSTIC_MUST_BE_READ_ONLY");
}
if (
  accountDiagnostic?.generation_submitted === true ||
  accountDiagnostic?.inference_performed === true ||
  accountDiagnostic?.endpoint_mutation_performed === true ||
  accountDiagnostic?.queue_mutation_performed === true ||
  accountDiagnostic?.production_deploy_performed === true ||
  accountDiagnostic?.pricing_activation_performed === true
) {
  throw new Error("AVANTIQO_CODE_CERTIFICATION_ACCOUNT_DIAGNOSTIC_MUTATION_REFUSED");
}

const hardBlockers = list(accountDiagnostic?.hard_blockers).map(text).filter(Boolean);
const controlWorkerReadErrors = list(
  accountDiagnostic?.account_serverless_usage?.control_worker_read_errors,
);
if (controlWorkerReadErrors.length > 0) {
  throw new Error(
    `AVANTIQO_CODE_CERTIFICATION_ACCOUNT_CONTROL_WORKER_READ_INCOMPLETE:${controlWorkerReadErrors.length}`,
  );
}

const codeEndpointId = text(codeDiagnostic?.endpoint?.id);
const activeRows = list(
  accountDiagnostic?.account_serverless_usage?.endpoints_with_active_control_workers,
);
const codeControlRow = activeRows.find((row) =>
  text(row?.endpoint_id) === codeEndpointId || text(row?.endpoint_name) === CODE_ENDPOINT_NAME
) || null;
const codeControlWorkers = list(codeControlRow?.control_workers);
const codeUsableActiveWorker = codeControlWorkers.some((worker) =>
  USABLE_CODE_WORKER_STATUSES.has(text(worker?.status).toUpperCase()) &&
  worker?.is_stale !== true
);
const codeBadActiveStatuses = codeControlWorkers
  .map((worker) => text(worker?.status).toUpperCase())
  .filter(Boolean)
  .filter((status) => !USABLE_CODE_WORKER_STATUSES.has(status));

if (codeControlWorkers.length > 0 && !codeUsableActiveWorker) {
  throw new Error(
    `AVANTIQO_CODE_CERTIFICATION_CODE_CONTROL_WORKER_NOT_USABLE:${codeBadActiveStatuses.join(",") || "UNKNOWN"}`,
  );
}

const concurrencyRemaining = finite(
  accountDiagnostic?.account_serverless_usage?.concurrency_remaining,
  -1,
);
if (hardBlockers.length > 0) {
  throw new Error(
    `AVANTIQO_CODE_CERTIFICATION_RUNPOD_ACCOUNT_BLOCKED:${hardBlockers.join(",")}`,
  );
}
if (concurrencyRemaining < 1 && !codeUsableActiveWorker) {
  throw new Error(
    `AVANTIQO_CODE_CERTIFICATION_SERVERLESS_CAPACITY_UNAVAILABLE:remaining=${concurrencyRemaining}`,
  );
}

console.log(JSON.stringify({
  event: "AVANTIQO_CODE_CERTIFICATION_RUNPOD_PREFLIGHT_PASS",
  contract: CONTRACT,
  code_endpoint_id: codeEndpointId || null,
  code_endpoint_name: CODE_ENDPOINT_NAME,
  code_queue_clean: true,
  code_template_resolved: true,
  code_network_volume_attached: true,
  bound_gpu_capacity_available: true,
  account_hard_blockers: hardBlockers,
  account_concurrency_remaining: concurrencyRemaining,
  code_active_control_worker_present: codeControlWorkers.length > 0,
  code_usable_active_worker: codeUsableActiveWorker,
  new_provider_execution_submitted: false,
  endpoint_mutation_performed: false,
  production_deploy_performed: false,
  secrets_printed: false,
}));

process.exit(runCertification());
