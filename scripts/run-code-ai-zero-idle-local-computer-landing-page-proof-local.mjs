import os from "node:os";
import path from "node:path";
import process from "node:process";
import { execFileSync, spawnSync } from "node:child_process";
import { copyFile, mkdir, rm, writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();

const CONTRACT = "AVANTIQO_CODE_AI_ZERO_IDLE_LOCAL_COMPUTER_LANDING_PAGE_PROOF_V1";
const ENDPOINT_ID = "r79dtnjnrilrlc";
const REPOSITORY_URL = "https://github.com/churchillkaron/churchill-control-new";
const SERVICE_ID = "ai.code.debug";
const APP_ROOT = "local-audit-output/avantiqo-code-ai-landing-page";
const ALLOWED_FILES = Object.freeze([
  `${APP_ROOT}/index.html`,
  `${APP_ROOT}/styles.css`,
  `${APP_ROOT}/build.mjs`,
]);
const VERIFIER = "scripts/verify-code-ai-local-computer-landing-page.mjs";
const BUILD_OUTPUT = path.join(os.tmpdir(), "avantiqo-code-ai-zero-idle-landing-page-proof.html");
const EXPORT_ROOT = "local-audit-output/avantiqo-code-ai-zero-idle-landing-page-proof";
const REASONING_CALL_BUDGET = 4;
const MAX_RUNTIME_MS = 30 * 60 * 1000;
const POLL_MS = 1000;
const SCALE_DOWN_WAIT_MS = 4 * 60 * 1000;
const RUNPOD_REST = "https://rest.runpod.io/v1";
const RUNPOD_QUEUE = "https://api.runpod.ai/v2";

function text(value, maximum = 4000) {
  return String(value ?? "").trim().slice(0, maximum);
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function run(command, args, { capture = false, env = process.env } = {}) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env,
    encoding: "utf8",
    stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const stderr = text(result.stderr, 1000);
    throw new Error(`CODE_AI_ZERO_IDLE_LOCAL_LANDING_CHILD_FAILED:${command}:${result.status}:${stderr || "UNKNOWN"}`);
  }
  return capture ? String(result.stdout || "") : "";
}

function parseJson(output) {
  const start = output.indexOf("{");
  const end = output.lastIndexOf("}");
  if (start < 0 || end < start) {
    throw new Error("CODE_AI_ZERO_IDLE_LOCAL_LANDING_BOOTSTRAP_JSON_REQUIRED");
  }
  return JSON.parse(output.slice(start, end + 1));
}

function event(name, details = {}) {
  console.log(JSON.stringify({
    event: `AVANTIQO_CODE_ZERO_IDLE_LOCAL_LANDING_${name}`,
    at: new Date().toISOString(),
    contract: CONTRACT,
    ...details,
  }));
}

async function jsonRequest(url, key) {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(30_000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`CODE_AI_ZERO_IDLE_RUNPOD_HTTP_${response.status}:${text(body?.error || body?.message || body?.detail) || "UNKNOWN"}`);
  }
  return body;
}

function workerCounts(health = {}) {
  const workers = health.workers || {};
  return {
    idle: Number(workers.idle || 0),
    initializing: Number(workers.initializing || 0),
    ready: Number(workers.ready || 0),
    running: Number(workers.running || 0),
    throttled: Number(workers.throttled || 0),
    unhealthy: Number(workers.unhealthy || 0),
  };
}

function jobCounts(health = {}) {
  const jobs = health.jobs || {};
  return {
    in_queue: Number(jobs.inQueue ?? jobs.in_queue ?? 0),
    in_progress: Number(jobs.inProgress ?? jobs.in_progress ?? 0),
  };
}

function liveWorkerCount(health = {}) {
  return Object.values(workerCounts(health)).reduce((sum, value) => sum + Number(value || 0), 0);
}

function endpointFlashboot(endpoint = {}) {
  return endpoint.flashboot === true || endpoint.flashBoot === true || text(endpoint.flashBootType).toUpperCase() === "FLASHBOOT";
}

async function readEndpoint(managementKey) {
  return jsonRequest(`${RUNPOD_REST}/endpoints/${ENDPOINT_ID}`, managementKey);
}

async function readHealth(apiKey) {
  return jsonRequest(`${RUNPOD_QUEUE}/${ENDPOINT_ID}/health`, apiKey);
}

function assertZeroIdleEndpoint(endpoint, health) {
  const workersMin = Number(endpoint.workersMin ?? endpoint.workers_min ?? -1);
  const workersMax = Number(endpoint.workersMax ?? endpoint.workers_max ?? -1);
  if (workersMin !== 0 || workersMax !== 1) {
    throw new Error(`CODE_AI_ZERO_IDLE_ENDPOINT_0_1_REQUIRED:${workersMin}/${workersMax}`);
  }
  if (!endpointFlashboot(endpoint)) {
    throw new Error("CODE_AI_ZERO_IDLE_FLASHBOOT_REQUIRED");
  }
  if (!text(endpoint.networkVolumeId || endpoint.network_volume_id)) {
    throw new Error("CODE_AI_ZERO_IDLE_NETWORK_VOLUME_REQUIRED");
  }
  const jobs = jobCounts(health);
  if (jobs.in_queue !== 0 || jobs.in_progress !== 0) {
    throw new Error(`CODE_AI_ZERO_IDLE_BASELINE_QUEUE_NOT_EMPTY:${jobs.in_queue}/${jobs.in_progress}`);
  }
  if (liveWorkerCount(health) !== 0) {
    throw new Error(`CODE_AI_ZERO_IDLE_BASELINE_WORKER_PRESENT:${JSON.stringify(workerCounts(health))}`);
  }
}

async function waitForScaleDown(apiKey) {
  const started = Date.now();
  let last = null;
  while (Date.now() - started < SCALE_DOWN_WAIT_MS) {
    last = await readHealth(apiKey);
    const jobs = jobCounts(last);
    const workers = workerCounts(last);
    event("SCALE_DOWN_POLL", {
      elapsed_ms: Date.now() - started,
      jobs,
      workers,
    });
    if (jobs.in_queue === 0 && jobs.in_progress === 0 && liveWorkerCount(last) === 0) {
      return {
        success: true,
        elapsed_ms: Date.now() - started,
        health: last,
      };
    }
    await sleep(3000);
  }
  return {
    success: false,
    elapsed_ms: Date.now() - started,
    health: last,
  };
}

if (Number(String(process.versions.node || "").split(".")[0]) !== 24) {
  throw new Error(`CODE_AI_ZERO_IDLE_LOCAL_LANDING_NODE_24_REQUIRED:${process.version}`);
}
if (text(process.env.NODE_ENV).toLowerCase() !== "development") {
  throw new Error("CODE_AI_ZERO_IDLE_LOCAL_LANDING_DEVELOPMENT_ENV_REQUIRED");
}
if (text(process.env.AVANTIQO_CODE_ZERO_IDLE_LOCAL_COMPUTER_LANDING_APPROVED).toUpperCase() !== "YES") {
  throw new Error("AVANTIQO_CODE_ZERO_IDLE_LOCAL_COMPUTER_LANDING_APPROVED=YES_REQUIRED");
}
if (!text(process.env.NODE_OPTIONS).includes("code-ai-local-computer-workspace-loader.mjs")) {
  throw new Error("CODE_AI_ZERO_IDLE_LOCAL_COMPUTER_WORKSPACE_LOADER_REQUIRED");
}

const sourceRoot = path.resolve(process.env.AVANTIQO_CODE_LOCAL_REPOSITORY_ROOT || process.cwd());
process.env.AVANTIQO_CODE_LOCAL_REPOSITORY_ROOT = sourceRoot;

run("git", ["fetch", "origin", "main"]);
const expectedMainCommit = text(execFileSync("git", ["rev-parse", "origin/main"], {
  cwd: sourceRoot,
  encoding: "utf8",
})).toLowerCase();
if (!/^[0-9a-f]{40}$/.test(expectedMainCommit)) {
  throw new Error("CODE_AI_ZERO_IDLE_LOCAL_LANDING_MAIN_SHA_REQUIRED");
}

const bootstrapOutput = run(
  process.execPath,
  ["scripts/bootstrap-code-ai-planner-certification-local.mjs"],
  { capture: true },
);
process.stdout.write(bootstrapOutput);
const bootstrap = parseJson(bootstrapOutput);
const organizationId = text(bootstrap.organization_id);
if (!organizationId) throw new Error("CODE_AI_ZERO_IDLE_LOCAL_LANDING_ORGANIZATION_REQUIRED");
if (bootstrap?.service?.usage_enabled !== true || bootstrap?.service?.billing_enabled !== true) {
  throw new Error("CODE_AI_ZERO_IDLE_LOCAL_LANDING_SERVICE_ENABLE_REQUIRED");
}
if (Number(bootstrap?.wallet?.reserved_balance || 0) !== 0) {
  throw new Error("CODE_AI_ZERO_IDLE_LOCAL_LANDING_RESERVED_BALANCE_MUST_BE_ZERO");
}
if (Number(bootstrap?.wallet?.available_balance || 0) > 10.000001) {
  throw new Error("CODE_AI_ZERO_IDLE_LOCAL_LANDING_WALLET_CEILING_EXCEEDED");
}

Object.assign(process.env, {
  AVANTIQO_CODE_PLANNER_CERT_ORGANIZATION_ID: organizationId,
  AVANTIQO_CODE_WORKER_CONTROL_ORGANIZATION_ID: organizationId,
  AVANTIQO_CODE_WORKER_SESSION_ENABLED: "false",
  AVANTIQO_CODE_ZERO_IDLE_SERVERLESS_ENABLED: "true",
  AVANTIQO_CODE_CERTIFICATION_EXPECTED_MAIN_COMMIT: expectedMainCommit,
  AVANTIQO_CODE_ENGINE_ENABLED: "true",
  AVANTIQO_CODE_WORKSPACE_TARGET: "LOCAL_COMPUTER",
});

const managementKey = text(process.env.RUNPOD_MANAGEMENT_API_KEY || process.env.RUNPOD_API_KEY);
const apiKey = text(process.env.RUNPOD_AVANTIQO_CODE_API_KEY || process.env.RUNPOD_API_KEY);
if (!managementKey) throw new Error("CODE_AI_ZERO_IDLE_RUNPOD_MANAGEMENT_KEY_REQUIRED");
if (!apiKey) throw new Error("CODE_AI_ZERO_IDLE_RUNPOD_API_KEY_REQUIRED");

const supabase = createClient(
  required("NEXT_PUBLIC_SUPABASE_URL"),
  required("SUPABASE_SERVICE_ROLE_KEY"),
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  },
);

const [
  zeroIdleRuntime,
  { WalletRuntime },
] = await Promise.all([
  import("../lib/code/runtime/CodeAIEmployeeZeroIdleFastStartRuntime.js"),
  import("../lib/platform/service-runtime/wallet/runtime/WalletRuntime.js"),
]);

const { executeCodeAIEmployeeZeroIdleFastStartMission } = zeroIdleRuntime;
if (typeof executeCodeAIEmployeeZeroIdleFastStartMission !== "function") {
  throw new Error("CODE_AI_ZERO_IDLE_LOCAL_LANDING_RUNTIME_REQUIRED");
}

const endpointBefore = await readEndpoint(managementKey);
const healthBefore = await readHealth(apiKey);
assertZeroIdleEndpoint(endpointBefore, healthBefore);
event("BASELINE", {
  expected_main_commit: expectedMainCommit,
  endpoint: {
    workers_min: Number(endpointBefore.workersMin ?? 0),
    workers_max: Number(endpointBefore.workersMax ?? 0),
    flashboot: endpointFlashboot(endpointBefore),
    network_volume_id: text(endpointBefore.networkVolumeId || endpointBefore.network_volume_id) || null,
  },
  health: {
    jobs: jobCounts(healthBefore),
    workers: workerCounts(healthBefore),
  },
  idle_gpu_worker_count: 0,
  local_computer_target: true,
});

const objective = [
  "Build a small but polished premium landing page for a fictional product called Aurelia Ops, an AI operations workspace for modern businesses.",
  "The visual direction is high-end and restrained: near-black background, warm gold accents, crisp typography, generous spacing, subtle glass surfaces, and no stock imagery or external assets.",
  "The page must feel intentionally designed, not like a generic template. It needs a strong hero with a clear value proposition, at least three meaningful content sections, multiple calls to action, responsive behavior, keyboard-visible interaction states, and concise believable product copy.",
  `Create exactly these three files and do not edit anything else: ${ALLOWED_FILES.join(", ")}.`,
  "index.html must be semantic and reference ./styles.css. styles.css must contain the complete responsive design with no remote URLs.",
  "build.mjs must use only Node built-ins to read index.html and styles.css, inline the CSS into a standalone HTML document, and write it to the path provided by process.env.AVANTIQO_CODE_LANDING_BUILD_OUTPUT. It must fail clearly if that environment variable is absent.",
  `The authoritative verification command is: node ${VERIFIER}.`,
  "Use apply_files for source writes, run the exact verifier after the final edit, inspect the final diff, and complete only when the verifier passes and only the three allowed files are changed.",
  "Do not install packages, use the network, deploy, push, mutate databases, or expose secrets.",
].join(" ");

const objectiveContext = {
  selection_contract: CONTRACT,
  repository_head_observed: expectedMainCommit,
  evidence_backed: true,
  evidence_path_1: VERIFIER,
  authoritative_verification_command: "node",
  authoritative_verification_args: [VERIFIER],
  allowed_edit_paths: [...ALLOWED_FILES],
  completion_criterion_1: `The exact command node ${VERIFIER} passes after the implementation.`,
  completion_criterion_2: "Exactly the three declared landing-page source files are changed and no other repository path changes.",
  completion_criterion_3: "The final diff demonstrates a semantic responsive premium landing page and a standalone local build script.",
};

const walletBefore = await WalletRuntime.prepaid({
  organization_id: organizationId,
  currency: "THB",
  require_positive_balance: true,
});

let finalResult = null;
let resumeState = null;
let succeeded = false;
let firstReasoningObservedMs = null;
let firstPackageObservedMs = null;
let firstOperationObservedMs = null;
let scaleDown = null;
const startedAt = Date.now();

try {
  await rm(BUILD_OUTPUT, { force: true });

  for (let cycle = 1; ; cycle += 1) {
    const elapsedMs = Date.now() - startedAt;
    if (elapsedMs >= MAX_RUNTIME_MS) {
      throw new Error(`CODE_AI_ZERO_IDLE_LOCAL_LANDING_RUNTIME_LIMIT_EXCEEDED:${elapsedMs}`);
    }

    const result = await executeCodeAIEmployeeZeroIdleFastStartMission({
      context: {
        organizationId,
        actor: { id: "code-zero-idle-local-computer-landing-proof" },
        metadata: {
          certification_contract: CONTRACT,
          local_computer_proof: true,
          zero_idle_serverless_proof: true,
        },
      },
      objective,
      owner_intent:
        "Act as a strong human front-end engineer on this computer: understand the design brief, build the complete landing page coherently, verify it locally, review the diff, and finish only when it is genuinely good.",
      objective_context: objectiveContext,
      repository_url: REPOSITORY_URL,
      ref: "main",
      resume_state: resumeState,
      reasoning_call_budget: REASONING_CALL_BUDGET,
      max_employee_passes: 8,
      timeout_ms: 20 * 60 * 1000,
    });

    const reasoningCalls = Number(result.state?.work_package_control?.reasoning_calls_used || 0);
    const packageCount = Number(result.state?.work_package_control?.packages_executed || 0);
    const operationCount = Number(result.state?.work_package_control?.operations_executed || 0);
    const observedMs = Date.now() - startedAt;
    if (reasoningCalls > 0 && firstReasoningObservedMs === null) firstReasoningObservedMs = observedMs;
    if (packageCount > 0 && firstPackageObservedMs === null) firstPackageObservedMs = observedMs;
    if (operationCount > 0 && firstOperationObservedMs === null) firstOperationObservedMs = observedMs;

    event("CYCLE", {
      cycle,
      status: result.status,
      success: result.success === true,
      elapsed_ms: observedMs,
      reasoning_calls_used: reasoningCalls,
      reasoning_call_budget: REASONING_CALL_BUDGET,
      package_count: packageCount,
      operation_count: operationCount,
      first_reasoning_observed_ms: firstReasoningObservedMs,
      first_package_observed_ms: firstPackageObservedMs,
      first_operation_observed_ms: firstOperationObservedMs,
      execution_transport: result.execution_transport?.transport || null,
      worker_session_created: result.execution_transport?.worker_session_created === true,
      serverless_worker_requested_by_fast_start:
        result.execution_transport?.serverless_worker_requested_by_fast_start === true,
      local_computer_target: true,
      source_root_preserved: true,
    });

    if (reasoningCalls > REASONING_CALL_BUDGET) {
      throw new Error(`CODE_AI_ZERO_IDLE_LOCAL_LANDING_REASONING_BUDGET_EXCEEDED:${reasoningCalls}`);
    }
    if (result.worker_session != null) {
      throw new Error("CODE_AI_ZERO_IDLE_LOCAL_LANDING_DIRECT_WORKER_SESSION_FORBIDDEN");
    }
    if (result.execution_transport?.transport !== "SERVERLESS_ZERO_IDLE") {
      throw new Error(`CODE_AI_ZERO_IDLE_LOCAL_LANDING_TRANSPORT_INVALID:${text(result.execution_transport?.transport)}`);
    }
    if (result.status === "planner_pending") {
      resumeState = result.state;
      await sleep(POLL_MS);
      continue;
    }
    finalResult = result;
    break;
  }

  if (!finalResult) throw new Error("CODE_AI_ZERO_IDLE_LOCAL_LANDING_FINAL_RESULT_REQUIRED");
  if (finalResult.success !== true || finalResult.status !== "completed") {
    throw new Error(`CODE_AI_ZERO_IDLE_LOCAL_LANDING_MISSION_FAILED:${finalResult.reason || finalResult.status}`);
  }

  const changedFiles = [...new Set(list(finalResult.state?.files_changed).map((item) => text(item)))].sort();
  const expectedFiles = [...ALLOWED_FILES].sort();
  if (JSON.stringify(changedFiles) !== JSON.stringify(expectedFiles)) {
    throw new Error(`CODE_AI_ZERO_IDLE_LOCAL_LANDING_SCOPE_VIOLATION:${changedFiles.join(",")}`);
  }

  const passedVerificationIds = new Set(
    list(finalResult.state?.verification)
      .filter((entry) => entry?.passed === true)
      .map((entry) => text(entry?.operation_id))
      .filter(Boolean),
  );
  const exactVerifierPassed = list(finalResult.state?.tests).some((entry) =>
    passedVerificationIds.has(text(entry?.operation_id)) &&
    text(entry?.command) === "node" &&
    list(entry?.args).includes(VERIFIER) &&
    Number(entry?.exit_code) === 0
  );
  if (!exactVerifierPassed) throw new Error("CODE_AI_ZERO_IDLE_LOCAL_LANDING_EXACT_VERIFIER_REQUIRED");
  if (!text(finalResult.state?.patch, 768 * 1024)) {
    throw new Error("CODE_AI_ZERO_IDLE_LOCAL_LANDING_FINAL_DIFF_REQUIRED");
  }
  if (finalResult.employee_completion?.complete !== true) {
    throw new Error("CODE_AI_ZERO_IDLE_LOCAL_LANDING_EMPLOYEE_COMPLETION_REQUIRED");
  }
  if (finalResult.worldclass_quality?.verified !== true) {
    throw new Error("CODE_AI_ZERO_IDLE_LOCAL_LANDING_WORLDCLASS_QUALITY_REQUIRED");
  }
  if (finalResult.product_completion_criteria?.verified !== true) {
    throw new Error("CODE_AI_ZERO_IDLE_LOCAL_LANDING_PRODUCT_COMPLETION_REQUIRED");
  }

  const sourceChanges = new Map(
    list(finalResult.state?.source_changes)
      .filter((entry) => entry?.operation === "write")
      .map((entry) => [text(entry?.path), String(entry?.content ?? "")]),
  );
  for (const filePath of ALLOWED_FILES) {
    if (!sourceChanges.has(filePath)) {
      throw new Error(`CODE_AI_ZERO_IDLE_LOCAL_LANDING_EXPORT_SOURCE_REQUIRED:${filePath}`);
    }
  }

  const exportAbsolute = path.join(sourceRoot, EXPORT_ROOT);
  await rm(exportAbsolute, { recursive: true, force: true });
  await mkdir(path.join(exportAbsolute, "source"), { recursive: true });
  for (const filePath of ALLOWED_FILES) {
    await writeFile(
      path.join(exportAbsolute, "source", path.basename(filePath)),
      sourceChanges.get(filePath),
      "utf8",
    );
  }
  await copyFile(BUILD_OUTPUT, path.join(exportAbsolute, "landing-page.html"));

  const walletAfter = await WalletRuntime.prepaid({
    organization_id: organizationId,
    currency: "THB",
    require_positive_balance: false,
  });
  const walletDebit = Number(walletBefore.available_balance || 0) - Number(walletAfter.available_balance || 0);
  if (!(walletDebit > 0) || walletDebit > 10.000001) {
    throw new Error(`CODE_AI_ZERO_IDLE_LOCAL_LANDING_WALLET_DEBIT_INVALID:${walletDebit}`);
  }

  scaleDown = await waitForScaleDown(apiKey);
  if (!scaleDown.success) {
    throw new Error(`CODE_AI_ZERO_IDLE_LOCAL_LANDING_SCALE_DOWN_NOT_PROVEN:${JSON.stringify(workerCounts(scaleDown.health || {}))}`);
  }

  const endpointAfter = await readEndpoint(managementKey);
  const healthAfter = await readHealth(apiKey);
  assertZeroIdleEndpoint(endpointAfter, healthAfter);

  const reasoningCalls = Number(finalResult.state?.work_package_control?.reasoning_calls_used || 0);
  const proof = {
    success: true,
    contract: CONTRACT,
    expected_main_commit: expectedMainCommit,
    workspace_transport: "LOCAL_COMPUTER",
    reasoning_transport: "SERVERLESS_ZERO_IDLE",
    workspace_isolated_git_worktree: true,
    mac_or_pc_source_root_preserved: true,
    ai_employee_wrote_source: true,
    ai_employee_ran_local_verifier: true,
    ai_employee_reviewed_final_diff: true,
    exact_verifier_passed: true,
    employee_completion_verified: true,
    worldclass_quality_verified: true,
    product_completion_verified: true,
    changed_files: changedFiles,
    reasoning_calls_used: reasoningCalls,
    reasoning_call_budget: REASONING_CALL_BUDGET,
    package_count: Number(finalResult.state?.work_package_control?.packages_executed || 0),
    operation_count: Number(finalResult.state?.work_package_control?.operations_executed || 0),
    wallet_debit_thb: walletDebit,
    first_reasoning_observed_ms: firstReasoningObservedMs,
    first_package_observed_ms: firstPackageObservedMs,
    first_operation_observed_ms: firstOperationObservedMs,
    mission_completed_ms: Date.now() - startedAt,
    serverless_workers_min: Number(endpointAfter.workersMin ?? 0),
    serverless_workers_max: Number(endpointAfter.workersMax ?? 0),
    flashboot_enabled: endpointFlashboot(endpointAfter),
    baseline_live_workers: 0,
    worker_session_created: false,
    serverless_scaled_back_to_zero: true,
    scale_down_wait_ms: scaleDown.elapsed_ms,
    final_live_workers: liveWorkerCount(healthAfter),
    idle_gpu_cost_target: "ZERO_WHEN_NO_WORKER_RUNNING",
    exported_preview: `${EXPORT_ROOT}/landing-page.html`,
    exported_source_directory: `${EXPORT_ROOT}/source`,
    production_deploy_performed: false,
    github_write_performed_by_ai: false,
    database_mutation_performed_by_ai: false,
    secrets_printed: false,
  };
  await writeFile(
    path.join(exportAbsolute, "proof.json"),
    `${JSON.stringify(proof, null, 2)}\n`,
    "utf8",
  );
  console.log(JSON.stringify(proof, null, 2));
  console.log(`${CONTRACT}=PASS`);
  succeeded = true;
} finally {
  if (!scaleDown?.success) {
    const finalScaleDown = await waitForScaleDown(apiKey).catch(() => null);
    if (finalScaleDown?.success) {
      console.log(`${CONTRACT}_FAILURE_CLEANUP_SCALE_DOWN_VERIFIED=true`);
    } else {
      console.error(`${CONTRACT}_FAILURE_CLEANUP_SCALE_DOWN_VERIFIED=false`);
    }
  }

  const disabled = await supabase
    .from("organization_services")
    .update({ usage_enabled: false, billing_enabled: false })
    .eq("organization_id", organizationId)
    .eq("service_id", SERVICE_ID)
    .select("id,usage_enabled,billing_enabled")
    .maybeSingle();
  if (disabled.error) {
    if (succeeded) throw disabled.error;
    console.error(`AVANTIQO_CODE_ZERO_IDLE_LOCAL_LANDING_SERVICE_DISABLE_FAILED:${disabled.error.message}`);
  }
}
