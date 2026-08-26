import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();

const CONTRACT = "AVANTIQO_CODE_AUTONOMOUS_PLANNER_CAPACITY_SAFE_RUNNER_V1";
const CODE_ENDPOINT_NAME = "avantiqo-code-v1";
const THIS_SCRIPT = fileURLToPath(import.meta.url);
const MAIN_RESTART_ENV = "AVANTIQO_CODE_CERT_PREFLIGHT_MAIN_RESTART_COUNT";
const MAX_MAIN_RESTARTS = 5;
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

function runGit(args, { capture = false } = {}) {
  const result = spawnSync("git", args, {
    cwd: process.cwd(),
    env: process.env,
    encoding: "utf8",
    stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = capture ? text(`${result.stdout || ""}\n${result.stderr || ""}`) : "";
    throw new Error(
      `AVANTIQO_CODE_CERTIFICATION_GIT_FAILED:${args.join(" ")}:${result.status}${detail ? `:${detail.slice(0, 600)}` : ""}`,
    );
  }
  return capture ? text(result.stdout) : "";
}

function gitHead(ref) {
  return runGit(["rev-parse", ref], { capture: true });
}

function currentBranch() {
  return runGit(["rev-parse", "--abbrev-ref", "HEAD"], { capture: true });
}

function mainRestartCount() {
  const value = Number(process.env[MAIN_RESTART_ENV] || 0);
  return Number.isInteger(value) && value >= 0 ? value : 0;
}

function syncMainAndRelaunch(reason) {
  const restartCount = mainRestartCount();
  if (restartCount >= MAX_MAIN_RESTARTS) {
    throw new Error(
      `AVANTIQO_CODE_CERTIFICATION_MAIN_ADVANCE_RESTART_BUDGET_EXHAUSTED:${restartCount}:${reason}`,
    );
  }
  if (currentBranch() !== "main") {
    throw new Error("AVANTIQO_CODE_CERTIFICATION_MAIN_BRANCH_REQUIRED");
  }

  runGit(["fetch", "origin", "main"]);
  const headBefore = gitHead("HEAD");
  const originMain = gitHead("origin/main");
  if (headBefore !== originMain) {
    runGit(["merge", "--ff-only", "origin/main"]);
  }
  const headAfter = gitHead("HEAD");
  if (headAfter !== gitHead("origin/main")) {
    throw new Error(
      `AVANTIQO_CODE_CERTIFICATION_MAIN_FAST_FORWARD_FAILED:head=${headAfter}:origin_main=${gitHead("origin/main")}`,
    );
  }

  console.log(JSON.stringify({
    event: "AVANTIQO_CODE_CERTIFICATION_MAIN_ADVANCED_RESTART",
    contract: CONTRACT,
    reason,
    restart_count_before: restartCount,
    restart_count_after: restartCount + 1,
    head_before: headBefore,
    head_after: headAfter,
    provider_execution_submitted: false,
    service_enabled: false,
    production_deploy_performed: false,
    secrets_printed: false,
  }));

  const relaunched = spawnSync(
    process.execPath,
    [THIS_SCRIPT, ...process.argv.slice(2)],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        [MAIN_RESTART_ENV]: String(restartCount + 1),
      },
      stdio: "inherit",
    },
  );
  if (relaunched.error) throw relaunched.error;
  process.exit(Number.isInteger(relaunched.status) ? relaunched.status : 1);
}

function ensureCurrentMainOrRestart(reason) {
  if (currentBranch() !== "main") {
    throw new Error("AVANTIQO_CODE_CERTIFICATION_MAIN_BRANCH_REQUIRED");
  }
  runGit(["fetch", "origin", "main"]);
  const head = gitHead("HEAD");
  const originMain = gitHead("origin/main");
  if (head !== originMain) syncMainAndRelaunch(reason);
  return head;
}

function runCapture(script) {
  const result = spawnSync(process.execPath, [script], {
    cwd: process.cwd(),
    env: process.env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error) throw result.error;
  const stdout = text(result.stdout);
  const stderr = text(result.stderr);
  if (stdout) process.stdout.write(`${stdout}\n`);
  if (stderr) process.stderr.write(`${stderr}\n`);
  if (result.status !== 0) {
    const combined = `${stdout}\n${stderr}`;
    if (
      combined.includes("LOCAL_MAIN_NOT_CURRENT") ||
      combined.includes("MAIN_NOT_CURRENT")
    ) {
      syncMainAndRelaunch(`PRECHECK_MAIN_MOVED:${script}`);
    }
    throw new Error(
      `AVANTIQO_CODE_CERTIFICATION_PREFLIGHT_CHILD_FAILED:${script}:${result.status}`,
    );
  }
  return stdout;
}

function runCertification(expectedMainCommit) {
  const result = spawnSync(
    process.execPath,
    ["scripts/run-code-ai-autonomous-planner-certification-local.mjs"],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        AVANTIQO_CODE_CERTIFICATION_EXPECTED_MAIN_COMMIT: expectedMainCommit,
      },
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

ensureCurrentMainOrRestart("INITIAL_PREFLIGHT_MAIN_SYNC");

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

const accountUsage = accountDiagnostic?.account_serverless_usage || {};
const concurrencyRemaining = finite(accountUsage.concurrency_remaining, -1);
const totalActiveControlWorkers = finite(accountUsage.total_active_control_workers, -1);
const maxServerlessConcurrency = finite(accountUsage.max_serverless_concurrency, -1);
const concurrencyAtLimit =
  maxServerlessConcurrency > 0 && totalActiveControlWorkers === maxServerlessConcurrency;
const concurrencyOverLimit =
  maxServerlessConcurrency >= 0 && totalActiveControlWorkers > maxServerlessConcurrency;
const nonConcurrencyBlockers = hardBlockers.filter(
  (blocker) => blocker !== "SERVERLESS_CONCURRENCY_LIMIT_EXHAUSTED",
);

if (nonConcurrencyBlockers.length > 0) {
  throw new Error(
    `AVANTIQO_CODE_CERTIFICATION_RUNPOD_ACCOUNT_BLOCKED:${nonConcurrencyBlockers.join(",")}`,
  );
}
if (concurrencyOverLimit || concurrencyRemaining < 0) {
  throw new Error(
    `AVANTIQO_CODE_CERTIFICATION_SERVERLESS_CAPACITY_OVER_LIMIT:active=${totalActiveControlWorkers}:max=${maxServerlessConcurrency}:remaining=${concurrencyRemaining}`,
  );
}
if (
  hardBlockers.includes("SERVERLESS_CONCURRENCY_LIMIT_EXHAUSTED") &&
  (!concurrencyAtLimit || !codeUsableActiveWorker)
) {
  throw new Error(
    `AVANTIQO_CODE_CERTIFICATION_SERVERLESS_CAPACITY_UNAVAILABLE:active=${totalActiveControlWorkers}:max=${maxServerlessConcurrency}:remaining=${concurrencyRemaining}:code_worker=${codeUsableActiveWorker}`,
  );
}
if (concurrencyRemaining < 1 && !codeUsableActiveWorker) {
  throw new Error(
    `AVANTIQO_CODE_CERTIFICATION_SERVERLESS_CAPACITY_UNAVAILABLE:remaining=${concurrencyRemaining}`,
  );
}

const stableMainCommit = ensureCurrentMainOrRestart("FINAL_PREFLIGHT_MAIN_SYNC");
if (
  text(accountDiagnostic?.main_commit) &&
  text(accountDiagnostic.main_commit) !== stableMainCommit
) {
  syncMainAndRelaunch(
    `ACCOUNT_DIAGNOSTIC_MAIN_CHANGED:diagnostic=${text(accountDiagnostic.main_commit)}:current=${stableMainCommit}`,
  );
}

console.log(JSON.stringify({
  event: "AVANTIQO_CODE_CERTIFICATION_RUNPOD_PREFLIGHT_PASS",
  contract: CONTRACT,
  main_commit: stableMainCommit,
  preflight_main_restart_count: mainRestartCount(),
  code_endpoint_id: codeEndpointId || null,
  code_endpoint_name: CODE_ENDPOINT_NAME,
  code_queue_clean: true,
  code_template_resolved: true,
  code_network_volume_attached: true,
  bound_gpu_capacity_available: true,
  account_hard_blockers: hardBlockers,
  account_active_control_workers: totalActiveControlWorkers,
  account_max_serverless_concurrency: maxServerlessConcurrency,
  account_concurrency_remaining: concurrencyRemaining,
  account_at_capacity: concurrencyAtLimit,
  account_over_capacity: concurrencyOverLimit,
  existing_code_worker_allows_at_capacity_execution:
    concurrencyAtLimit && codeUsableActiveWorker,
  code_active_control_worker_present: codeControlWorkers.length > 0,
  code_usable_active_worker: codeUsableActiveWorker,
  new_provider_execution_submitted: false,
  endpoint_mutation_performed: false,
  production_deploy_performed: false,
  secrets_printed: false,
}));

process.exit(runCertification(stableMainCommit));
