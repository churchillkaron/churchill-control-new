import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();

const CONTRACT = "AVANTIQO_CODE_AUTONOMOUS_PLANNER_CAPACITY_SAFE_RUNNER_V2";
const THIS_SCRIPT = fileURLToPath(import.meta.url);
const MAIN_RESTART_ENV = "AVANTIQO_CODE_CERT_PREFLIGHT_MAIN_RESTART_COUNT";
const MAX_MAIN_RESTARTS = 5;

function text(value) {
  return String(value ?? "").trim();
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
    throw new Error(`AVANTIQO_CODE_CERTIFICATION_GIT_FAILED:${args.join(" ")}:${result.status}${detail ? `:${detail.slice(0, 600)}` : ""}`);
  }
  return capture ? text(result.stdout) : "";
}

function mainRestartCount() {
  const value = Number(process.env[MAIN_RESTART_ENV] || 0);
  return Number.isInteger(value) && value >= 0 ? value : 0;
}

function ensureCurrentMain() {
  if (runGit(["rev-parse", "--abbrev-ref", "HEAD"], { capture: true }) !== "main") {
    throw new Error("AVANTIQO_CODE_CERTIFICATION_MAIN_BRANCH_REQUIRED");
  }
  runGit(["fetch", "origin", "main"]);
  const head = runGit(["rev-parse", "HEAD"], { capture: true });
  const remote = runGit(["rev-parse", "origin/main"], { capture: true });
  if (head === remote) return head;

  const restarts = mainRestartCount();
  if (restarts >= MAX_MAIN_RESTARTS) {
    throw new Error(`AVANTIQO_CODE_CERTIFICATION_MAIN_ADVANCE_RESTART_BUDGET_EXHAUSTED:${restarts}`);
  }
  runGit(["merge", "--ff-only", "origin/main"]);
  const updated = runGit(["rev-parse", "HEAD"], { capture: true });
  console.log(JSON.stringify({
    event: "AVANTIQO_CODE_CERTIFICATION_MAIN_ADVANCED_RESTART",
    contract: CONTRACT,
    head_before: head,
    head_after: updated,
    provider_execution_submitted: false,
    production_deploy_performed: false,
    secrets_printed: false,
  }));
  const relaunched = spawnSync(process.execPath, [THIS_SCRIPT, ...process.argv.slice(2)], {
    cwd: process.cwd(),
    env: { ...process.env, [MAIN_RESTART_ENV]: String(restarts + 1) },
    stdio: "inherit",
  });
  if (relaunched.error) throw relaunched.error;
  process.exit(Number.isInteger(relaunched.status) ? relaunched.status : 1);
}

if (text(process.env.NODE_ENV).toLowerCase() !== "development") {
  throw new Error("AVANTIQO_CODE_CERTIFICATION_DEVELOPMENT_ENV_REQUIRED");
}
if (text(process.env.AVANTIQO_CODE_PLANNER_SPEND_APPROVED).toUpperCase() !== "YES") {
  throw new Error("AVANTIQO_CODE_PLANNER_SPEND_APPROVAL_REQUIRED");
}

const mainCommit = ensureCurrentMain();
const certificationEnv = {
  ...process.env,
  AVANTIQO_CODE_CERTIFICATION_EXPECTED_MAIN_COMMIT: mainCommit,
};
console.log(JSON.stringify({
  event: "AVANTIQO_CODE_CERTIFICATION_SAFE_LEASE_HANDOFF",
  contract: CONTRACT,
  main_commit: mainCommit,
  certification_expected_main_commit: mainCommit,
  certification_workspace_pin_active: true,
  code_resting_state_required: "0/0",
  workers_min_one_allowed: false,
  paid_execution_policy: "RUNPOD_SAFE_LEASE_V2",
  parallel_work_allowed: true,
  certification_resilience_wrapper: "AVANTIQO_CODE_AI_CERTIFICATION_RESILIENCE_V1",
  new_provider_execution_submitted: false,
  production_deploy_performed: false,
  secrets_printed: false,
}));

const result = spawnSync(process.execPath, ["scripts/run-code-ai-autonomous-planner-certification-resilient-local.mjs"], {
  cwd: process.cwd(),
  env: certificationEnv,
  stdio: "inherit",
});
if (result.error) throw result.error;
process.exit(Number.isInteger(result.status) ? result.status : 1);
