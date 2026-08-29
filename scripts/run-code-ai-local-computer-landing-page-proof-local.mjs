import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { execFileSync, spawnSync } from "node:child_process";
import { copyFile, mkdir, rm, writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();

const CONTRACT = "AVANTIQO_CODE_AI_LOCAL_COMPUTER_LANDING_PAGE_PROOF_V1";
const REPOSITORY_URL = "https://github.com/churchillkaron/churchill-control-new";
const SERVICE_ID = "ai.code.debug";
const APP_ROOT = "local-audit-output/avantiqo-code-ai-landing-page";
const ALLOWED_FILES = Object.freeze([
  `${APP_ROOT}/index.html`,
  `${APP_ROOT}/styles.css`,
  `${APP_ROOT}/build.mjs`,
]);
const VERIFIER = "scripts/verify-code-ai-local-computer-landing-page.mjs";
const BUILD_OUTPUT = path.join(os.tmpdir(), "avantiqo-code-ai-landing-page-proof.html");
const EXPORT_ROOT = "local-audit-output/avantiqo-code-ai-landing-page-proof";
const REASONING_CALL_BUDGET = 4;
const MAX_RUNTIME_MS = 30 * 60 * 1000;
const POLL_MS = 1000;

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
    throw new Error(`CODE_AI_LOCAL_LANDING_CHILD_FAILED:${command}:${result.status}:${stderr || "UNKNOWN"}`);
  }
  return capture ? String(result.stdout || "") : "";
}

function parseJson(output) {
  const start = output.indexOf("{");
  const end = output.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("CODE_AI_LOCAL_LANDING_BOOTSTRAP_JSON_REQUIRED");
  return JSON.parse(output.slice(start, end + 1));
}

function event(name, details = {}) {
  console.log(JSON.stringify({
    event: `AVANTIQO_CODE_LOCAL_LANDING_${name}`,
    at: new Date().toISOString(),
    contract: CONTRACT,
    ...details,
  }));
}

if (Number(String(process.versions.node || "").split(".")[0]) !== 24) {
  throw new Error(`CODE_AI_LOCAL_LANDING_NODE_24_REQUIRED:${process.version}`);
}
if (text(process.env.NODE_ENV).toLowerCase() !== "development") {
  throw new Error("CODE_AI_LOCAL_LANDING_DEVELOPMENT_ENV_REQUIRED");
}
if (text(process.env.AVANTIQO_CODE_LOCAL_COMPUTER_LANDING_APPROVED).toUpperCase() !== "YES") {
  throw new Error("AVANTIQO_CODE_LOCAL_COMPUTER_LANDING_APPROVED=YES_REQUIRED");
}
if (!text(process.env.NODE_OPTIONS).includes("code-ai-local-computer-workspace-loader.mjs")) {
  throw new Error("CODE_AI_LOCAL_COMPUTER_WORKSPACE_LOADER_REQUIRED");
}

const sourceRoot = path.resolve(process.env.AVANTIQO_CODE_LOCAL_REPOSITORY_ROOT || process.cwd());
process.env.AVANTIQO_CODE_LOCAL_REPOSITORY_ROOT = sourceRoot;

run("git", ["fetch", "origin", "main"]);
const expectedMainCommit = text(execFileSync("git", ["rev-parse", "origin/main"], {
  cwd: sourceRoot,
  encoding: "utf8",
})).toLowerCase();
if (!/^[0-9a-f]{40}$/.test(expectedMainCommit)) {
  throw new Error("CODE_AI_LOCAL_LANDING_MAIN_SHA_REQUIRED");
}

const bootstrapOutput = run(
  process.execPath,
  ["scripts/bootstrap-code-ai-planner-certification-local.mjs"],
  { capture: true },
);
process.stdout.write(bootstrapOutput);
const bootstrap = parseJson(bootstrapOutput);
const organizationId = text(bootstrap.organization_id);
if (!organizationId) throw new Error("CODE_AI_LOCAL_LANDING_ORGANIZATION_REQUIRED");
if (bootstrap?.service?.usage_enabled !== true || bootstrap?.service?.billing_enabled !== true) {
  throw new Error("CODE_AI_LOCAL_LANDING_SERVICE_ENABLE_REQUIRED");
}
if (Number(bootstrap?.wallet?.reserved_balance || 0) !== 0) {
  throw new Error("CODE_AI_LOCAL_LANDING_RESERVED_BALANCE_MUST_BE_ZERO");
}
if (Number(bootstrap?.wallet?.available_balance || 0) > 10.000001) {
  throw new Error("CODE_AI_LOCAL_LANDING_WALLET_CEILING_EXCEEDED");
}

const workerSecret = crypto.randomBytes(32).toString("hex");
Object.assign(process.env, {
  AVANTIQO_CODE_PLANNER_CERT_ORGANIZATION_ID: organizationId,
  AVANTIQO_CODE_WORKER_CONTROL_ORGANIZATION_ID: organizationId,
  AVANTIQO_CODE_WORKER_SESSION_SECRET: workerSecret,
  AVANTIQO_CODE_WORKER_SESSION_ENABLED: "true",
  AVANTIQO_CODE_CERTIFICATION_EXPECTED_MAIN_COMMIT: expectedMainCommit,
  AVANTIQO_CODE_ENGINE_ENABLED: "true",
  AVANTIQO_CODE_WORKSPACE_TARGET: "LOCAL_COMPUTER",
});

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
  fastStartRuntime,
  workerReleaseRuntime,
  { WalletRuntime },
] = await Promise.all([
  import("../lib/code/runtime/CodeAIEmployeeFastStartRuntime.js"),
  import("../lib/code/runtime/CodeAIWorkerSessionReleaseRuntime.js"),
  import("../lib/platform/service-runtime/wallet/runtime/WalletRuntime.js"),
]);

const { executeCodeAIEmployeeFastStartMission } = fastStartRuntime;
const { releaseCodeAIWorkerSession } = workerReleaseRuntime;
if (typeof executeCodeAIEmployeeFastStartMission !== "function") {
  throw new Error("CODE_AI_LOCAL_LANDING_FAST_START_RUNTIME_REQUIRED");
}

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
const startedAt = Date.now();

try {
  await releaseCodeAIWorkerSession({ reason: "LOCAL_LANDING_PROOF_BASELINE" });
  await rm(BUILD_OUTPUT, { force: true });

  for (let cycle = 1; ; cycle += 1) {
    const elapsedMs = Date.now() - startedAt;
    if (elapsedMs >= MAX_RUNTIME_MS) {
      throw new Error(`CODE_AI_LOCAL_LANDING_RUNTIME_LIMIT_EXCEEDED:${elapsedMs}`);
    }

    const result = await executeCodeAIEmployeeFastStartMission({
      context: {
        organizationId,
        actor: { id: "code-local-computer-landing-proof" },
        metadata: {
          certification_contract: CONTRACT,
          local_computer_proof: true,
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
      warm_session_idle_ms: 30 * 60 * 1000,
    });

    const reasoningCalls = Number(result.state?.work_package_control?.reasoning_calls_used || 0);
    event("CYCLE", {
      cycle,
      status: result.status,
      success: result.success === true,
      elapsed_ms: elapsedMs,
      worker_ready: result.worker_session?.ready === true,
      worker_warming: result.status === "worker_warming",
      worker_reason: result.worker_session?.reason || null,
      reasoning_calls_used: reasoningCalls,
      reasoning_call_budget: REASONING_CALL_BUDGET,
      package_count: Number(result.state?.work_package_control?.packages_executed || 0),
      operation_count: Number(result.state?.work_package_control?.operations_executed || 0),
      local_computer_target: true,
      source_root_preserved: true,
    });

    if (reasoningCalls > REASONING_CALL_BUDGET) {
      throw new Error(`CODE_AI_LOCAL_LANDING_REASONING_BUDGET_EXCEEDED:${reasoningCalls}`);
    }
    if (["worker_warming", "planner_pending"].includes(result.status)) {
      resumeState = result.state;
      await new Promise((resolve) => setTimeout(resolve, POLL_MS));
      continue;
    }
    finalResult = result;
    break;
  }

  if (!finalResult) throw new Error("CODE_AI_LOCAL_LANDING_FINAL_RESULT_REQUIRED");
  if (finalResult.success !== true || finalResult.status !== "completed") {
    throw new Error(`CODE_AI_LOCAL_LANDING_MISSION_FAILED:${finalResult.reason || finalResult.status}`);
  }

  const changedFiles = [...new Set(list(finalResult.state?.files_changed).map((item) => text(item)))].sort();
  const expectedFiles = [...ALLOWED_FILES].sort();
  if (JSON.stringify(changedFiles) !== JSON.stringify(expectedFiles)) {
    throw new Error(`CODE_AI_LOCAL_LANDING_SCOPE_VIOLATION:${changedFiles.join(",")}`);
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
  if (!exactVerifierPassed) throw new Error("CODE_AI_LOCAL_LANDING_EXACT_VERIFIER_REQUIRED");
  if (!text(finalResult.state?.patch, 768 * 1024)) throw new Error("CODE_AI_LOCAL_LANDING_FINAL_DIFF_REQUIRED");
  if (finalResult.employee_completion?.complete !== true) throw new Error("CODE_AI_LOCAL_LANDING_EMPLOYEE_COMPLETION_REQUIRED");
  if (finalResult.worldclass_quality?.verified !== true) throw new Error("CODE_AI_LOCAL_LANDING_WORLDCLASS_QUALITY_REQUIRED");
  if (finalResult.product_completion_criteria?.verified !== true) throw new Error("CODE_AI_LOCAL_LANDING_PRODUCT_COMPLETION_REQUIRED");

  const sourceChanges = new Map(
    list(finalResult.state?.source_changes)
      .filter((entry) => entry?.operation === "write")
      .map((entry) => [text(entry?.path), String(entry?.content ?? "")]),
  );
  for (const filePath of ALLOWED_FILES) {
    if (!sourceChanges.has(filePath)) {
      throw new Error(`CODE_AI_LOCAL_LANDING_EXPORT_SOURCE_REQUIRED:${filePath}`);
    }
  }

  const exportAbsolute = path.join(sourceRoot, EXPORT_ROOT);
  await rm(exportAbsolute, { recursive: true, force: true });
  await mkdir(path.join(exportAbsolute, "source"), { recursive: true });
  for (const filePath of ALLOWED_FILES) {
    const destination = path.join(exportAbsolute, "source", path.basename(filePath));
    await writeFile(destination, sourceChanges.get(filePath), "utf8");
  }
  await copyFile(BUILD_OUTPUT, path.join(exportAbsolute, "landing-page.html"));

  const walletAfter = await WalletRuntime.prepaid({
    organization_id: organizationId,
    currency: "THB",
    require_positive_balance: false,
  });
  const walletDebit = Number(walletBefore.available_balance || 0) - Number(walletAfter.available_balance || 0);
  if (!(walletDebit > 0) || walletDebit > 10.000001) {
    throw new Error(`CODE_AI_LOCAL_LANDING_WALLET_DEBIT_INVALID:${walletDebit}`);
  }

  const reasoningCalls = Number(finalResult.state?.work_package_control?.reasoning_calls_used || 0);
  const proof = {
    success: true,
    contract: CONTRACT,
    expected_main_commit: expectedMainCommit,
    workspace_transport: "LOCAL_COMPUTER",
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
  await releaseCodeAIWorkerSession({
    reason: succeeded ? "LOCAL_LANDING_PROOF_COMPLETE" : "LOCAL_LANDING_PROOF_FAILED",
  }).catch((error) => {
    console.error(`AVANTIQO_CODE_LOCAL_LANDING_WORKER_RELEASE_FAILED:${text(error?.message || error, 500)}`);
  });

  const disabled = await supabase
    .from("organization_services")
    .update({ usage_enabled: false, billing_enabled: false })
    .eq("organization_id", organizationId)
    .eq("service_id", SERVICE_ID)
    .select("id,usage_enabled,billing_enabled")
    .maybeSingle();
  if (disabled.error) {
    if (succeeded) throw disabled.error;
    console.error(`AVANTIQO_CODE_LOCAL_LANDING_SERVICE_DISABLE_FAILED:${disabled.error.message}`);
  }
}
