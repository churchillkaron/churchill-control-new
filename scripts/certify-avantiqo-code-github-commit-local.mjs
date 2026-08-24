import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { resolve } from "node:path";

import { attestCodeMissionState } from "../lib/code/runtime/CodeMissionAttestationRuntime.js";
import {
  commitVerifiedCodeMission,
  recoverVerifiedCodeMissionCommit,
} from "../lib/code/runtime/CodeGitHubCommitRuntime.js";

const execFileAsync = promisify(execFile);
const CONTRACT = "AVANTIQO_CODE_GITHUB_LIVE_CERTIFICATION_V1";
const REPOSITORY = "churchillkaron/churchill-control-new";
const REPOSITORY_URL = `https://github.com/${REPOSITORY}`;
const REPOSITORY_EVIDENCE_PATH = "docs/certification/avantiqo-code-github-live.json";
const BENCHMARK_CONTRACT = "AVANTIQO_CODE_CERTIFICATION_BENCHMARK_V2";
const ECONOMICS_CONTRACT = "AVANTIQO_CODE_ECONOMICS_V1";
const PROMOTION_CONTRACT = "AVANTIQO_CODE_PROMOTION_PLAN_V1";
const SANDBOX_CONTRACT = "AVANTIQO_CODE_SANDBOX_CERTIFICATION_EVIDENCE_V1";
const APPROVAL = "AVANTIQO_CODE_GITHUB_LIVE_CERTIFICATION_APPROVED";
const ALLOW_DIRTY_WORKTREE = "AVANTIQO_CODE_GITHUB_LIVE_ALLOW_DIRTY_WORKTREE";
const OUTPUT = resolve(
  process.env.AVANTIQO_CODE_GITHUB_LIVE_CERTIFICATION_OUTPUT ||
    "/tmp/avantiqo-code-github-live-certification.json",
);

const EVIDENCE_PATHS = Object.freeze({
  benchmark: resolve(
    process.env.AVANTIQO_CODE_CERTIFICATION_INPUT ||
      "/tmp/avantiqo-code-certification-benchmark-rescored.json",
  ),
  economics: resolve(
    process.env.AVANTIQO_CODE_ECONOMICS_INPUT ||
      "/tmp/avantiqo-code-economics.json",
  ),
  promotion: resolve(
    process.env.AVANTIQO_CODE_PROMOTION_PLAN_INPUT ||
      "/tmp/avantiqo-code-promotion-plan.json",
  ),
  sandbox: resolve(
    process.env.AVANTIQO_CODE_SANDBOX_CERTIFICATION_INPUT ||
      "/tmp/avantiqo-code-sandbox-certification.json",
  ),
});

function text(value) {
  return String(value ?? "").trim();
}

function yes(value) {
  return text(value).toUpperCase() === "YES";
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value), "utf8").digest("hex");
}

async function git(args) {
  const result = await execFileAsync("git", args, {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
  });
  return text(result.stdout);
}

async function readEvidence(path) {
  const raw = await readFile(path, "utf8");
  return {
    path,
    raw,
    json: JSON.parse(raw),
    sha256: sha256(raw),
  };
}

function assertEvidence({ benchmark, economics, promotion, sandbox }) {
  const failures = [];

  if (text(benchmark.json?.contract) !== BENCHMARK_CONTRACT) failures.push("BENCHMARK_CONTRACT_INVALID");
  if (benchmark.json?.summary?.passed !== true) failures.push("BENCHMARK_PASS_REQUIRED");
  if (benchmark.json?.summary?.complete_suite !== true) failures.push("BENCHMARK_COMPLETE_SUITE_REQUIRED");
  if (benchmark.json?.summary?.planner_protocol_passed !== true) failures.push("BENCHMARK_PLANNER_PROTOCOL_REQUIRED");
  if (benchmark.json?.summary?.infrastructure_failure) failures.push("BENCHMARK_INFRASTRUCTURE_FAILURE_PRESENT");

  if (text(economics.json?.contract) !== ECONOMICS_CONTRACT) failures.push("ECONOMICS_CONTRACT_INVALID");
  if (economics.json?.source_benchmark_passed !== true) failures.push("ECONOMICS_BENCHMARK_PASS_REQUIRED");
  if (economics.json?.certification?.economics_measured !== true) failures.push("ECONOMICS_MEASUREMENT_REQUIRED");
  if (economics.json?.certification?.provider_billing_evidence_verified !== true) {
    failures.push("RUNPOD_PROVIDER_BILLING_EVIDENCE_REQUIRED");
  }
  if (economics.json?.activation_allowed !== false) failures.push("ECONOMICS_MUST_REMAIN_NON_ACTIVATING");
  if (economics.json?.production_deploy_performed !== false) failures.push("ECONOMICS_PRODUCTION_DEPLOY_FORBIDDEN");

  if (text(promotion.json?.contract) !== PROMOTION_CONTRACT) failures.push("PROMOTION_CONTRACT_INVALID");
  if (promotion.json?.ready_for_explicit_pricing_review !== true) failures.push("PROMOTION_PRICING_REVIEW_READINESS_REQUIRED");
  if (promotion.json?.ready_for_explicit_promotion !== false) failures.push("PROMOTION_MUST_REMAIN_EXPLICITLY_BLOCKED");
  if (promotion.json?.activation_performed !== false) failures.push("PROMOTION_ACTIVATION_MUST_NOT_HAVE_OCCURRED");
  if (promotion.json?.production_deployment_performed !== false) failures.push("PROMOTION_PRODUCTION_DEPLOY_FORBIDDEN");

  if (text(sandbox.json?.contract) !== SANDBOX_CONTRACT) failures.push("SANDBOX_CONTRACT_INVALID");
  if (sandbox.json?.sandbox_execution_certified !== true) failures.push("SANDBOX_CERTIFICATION_REQUIRED");
  if (sandbox.json?.direct_push_blocked !== true) failures.push("SANDBOX_DIRECT_PUSH_BLOCK_REQUIRED");
  if (sandbox.json?.governed_commit_runtime_required !== true) failures.push("SANDBOX_GOVERNED_COMMIT_REQUIRED");
  if (sandbox.json?.live_github_commit_performed !== false) failures.push("SANDBOX_MUST_PRECEDE_LIVE_GITHUB_COMMIT");
  if (sandbox.json?.production_deploy_performed !== false) failures.push("SANDBOX_PRODUCTION_DEPLOY_FORBIDDEN");

  if (failures.length) {
    throw new Error(`AVANTIQO_CODE_GITHUB_LIVE_EVIDENCE_BLOCKED:${failures.join(",")}`);
  }
}

function requiredEnvironmentNames() {
  return [
    "AVANTIQO_CODE_MISSION_ATTESTATION_SECRET",
    "AVANTIQO_CODE_GITHUB_REPOSITORIES",
    "AVANTIQO_CODE_GITHUB_CONNECTOR",
    "VERCEL_OIDC_TOKEN",
  ];
}

function assertEnvironment() {
  const missing = requiredEnvironmentNames().filter((name) => !text(process.env[name]));
  if (missing.length) {
    throw new Error(`AVANTIQO_CODE_GITHUB_LIVE_ENVIRONMENT_REQUIRED:${missing.join(",")}`);
  }
}

function repositoryRemoteAllowed(value) {
  const remote = text(value).replace(/\.git$/i, "");
  return (
    remote === REPOSITORY_URL ||
    remote === `git@github.com:${REPOSITORY}` ||
    remote === `ssh://git@github.com/${REPOSITORY}`
  );
}

async function localRepositoryState() {
  const [branch, baseCommit, status, origin] = await Promise.all([
    git(["branch", "--show-current"]),
    git(["rev-parse", "HEAD"]),
    git(["status", "--porcelain"]),
    git(["remote", "get-url", "origin"]),
  ]);

  if (branch !== "main") throw new Error(`AVANTIQO_CODE_GITHUB_LIVE_MAIN_REQUIRED:${branch || "DETACHED"}`);
  if (!/^[a-f0-9]{40}$/i.test(baseCommit)) throw new Error("AVANTIQO_CODE_GITHUB_LIVE_BASE_COMMIT_INVALID");
  const worktreeDirty = Boolean(status);
  const dirtyWorktreeAllowed = worktreeDirty && yes(process.env[ALLOW_DIRTY_WORKTREE]);
  if (worktreeDirty && !dirtyWorktreeAllowed) {
    throw new Error("AVANTIQO_CODE_GITHUB_LIVE_LOCAL_WORKTREE_MUST_BE_CLEAN");
  }
  if (!repositoryRemoteAllowed(origin)) {
    throw new Error(`AVANTIQO_CODE_GITHUB_LIVE_ORIGIN_MISMATCH:${origin || "MISSING"}`);
  }

  return {
    branch,
    baseCommit,
    origin,
    worktree_dirty: worktreeDirty,
    dirty_worktree_allowed: dirtyWorktreeAllowed,
    worktree_status_sha256: worktreeDirty ? sha256(status) : null,
  };
}

async function syncLocalMain() {
  await git(["fetch", "origin", "main"]);
  await git(["merge", "--ff-only", "origin/main"]);
  return git(["rev-parse", "HEAD"]);
}

async function writeFailure(error, extra = {}) {
  const failure = {
    success: false,
    contract: CONTRACT,
    generated_at: new Date().toISOString(),
    error: text(error?.message || error),
    ...extra,
    governed_commit_verified: false,
    live_github_commit_performed: false,
    force_used: false,
    production_deploy_performed: false,
  };
  await writeFile(OUTPUT, `${JSON.stringify(failure, null, 2)}\n`, "utf8").catch(() => null);
  console.error(JSON.stringify(failure, null, 2));
}

if (!yes(process.env[APPROVAL])) {
  throw new Error(`${APPROVAL}=YES_REQUIRED`);
}
assertEnvironment();

const evidenceEntries = await Promise.all(
  Object.entries(EVIDENCE_PATHS).map(async ([name, path]) => [name, await readEvidence(path)]),
);
const evidence = Object.fromEntries(evidenceEntries);
assertEvidence(evidence);

const local = await localRepositoryState();
const artifact = {
  contract: "AVANTIQO_CODE_GITHUB_LIVE_CERTIFICATION_ARTIFACT_V1",
  generated_at: new Date().toISOString(),
  repository: REPOSITORY,
  branch: "main",
  base_commit: local.baseCommit,
  governed_runtime_contract: "AVANTIQO_CODE_GITHUB_COMMIT_V1",
  evidence: Object.fromEntries(
    Object.entries(evidence).map(([name, item]) => [name, {
      contract: text(item.json?.contract) || null,
      sha256: item.sha256,
    }]),
  ),
  local_repository: {
    worktree_dirty: local.worktree_dirty,
    dirty_worktree_allowed_for_certification: local.dirty_worktree_allowed,
    worktree_status_sha256: local.worktree_status_sha256,
  },
  guarantees: {
    mission_attested: true,
    exact_base_required: true,
    force_forbidden: true,
    post_commit_verification_required: true,
    direct_git_push_used: false,
    local_worktree_not_modified_by_github_write: true,
    production_deploy_performed: false,
  },
};
const artifactContent = `${JSON.stringify(artifact, null, 2)}\n`;

const missionState = attestCodeMissionState({
  contract: "AVANTIQO_CODE_AI_MISSION_V1",
  repository_url: REPOSITORY_URL,
  ref: "main",
  base_commit: local.baseCommit,
  status: "completed",
  blockers: [],
  verification: [{
    passed: true,
    contract: "AVANTIQO_CODE_GITHUB_LIVE_PRECOMMIT_VERIFICATION_V1",
    benchmark_passed: true,
    economics_measured: true,
    provider_billing_verified: true,
    promotion_plan_ready_for_pricing_review: true,
    sandbox_execution_certified: true,
    direct_push_blocked: true,
    local_worktree_dirty: local.worktree_dirty,
    local_worktree_preserved: true,
  }],
  source_changes: [{
    path: REPOSITORY_EVIDENCE_PATH,
    content: artifactContent,
  }],
}, { env: process.env });

let commitResult;
try {
  commitResult = await commitVerifiedCodeMission({
    mission_state: missionState,
    commit_message: "Certify governed Code AI GitHub write-back",
    env: process.env,
  });
} catch (error) {
  const stale = text(error?.message) === "CODE_AI_GITHUB_BASE_COMMIT_MOVED_REPLAN_REQUIRED";
  await writeFailure(error, {
    expected_base_commit: error?.expected_base_commit || local.baseCommit,
    actual_base_commit: error?.actual_base_commit || null,
    stale_base_replan_required: stale,
    safe_to_retry_after_ff_sync: stale,
    local_worktree_dirty: local.worktree_dirty,
    local_worktree_preserved: true,
  });
  process.exit(1);
}

let recoveryResult;
try {
  recoveryResult = await recoverVerifiedCodeMissionCommit({
    mission_state: missionState,
    env: process.env,
  });
} catch (error) {
  await writeFailure(error, {
    commit_sha: commitResult?.commit_sha || null,
    previous_commit: commitResult?.previous_commit || local.baseCommit,
    live_github_commit_performed: true,
    governed_commit_verified: commitResult?.verified === true,
    verification_read_required: true,
    local_worktree_dirty: local.worktree_dirty,
    local_worktree_preserved: true,
  });
  process.exit(1);
}

if (
  commitResult?.success !== true ||
  commitResult?.verified !== true ||
  commitResult?.force !== false ||
  recoveryResult?.success !== true ||
  recoveryResult?.verified !== true ||
  recoveryResult?.commit_sha !== commitResult?.commit_sha ||
  recoveryResult?.previous_commit !== local.baseCommit
) {
  throw new Error("AVANTIQO_CODE_GITHUB_LIVE_POST_WRITE_VERIFICATION_FAILED");
}

let localSync = {
  attempted: !local.worktree_dirty,
  success: false,
  head: local.baseCommit,
  skipped_reason: local.worktree_dirty ? "PRESERVE_DIRTY_LOCAL_WORKTREE" : null,
  error: null,
};
if (!local.worktree_dirty) {
  try {
    localSync.head = await syncLocalMain();
    localSync.success = true;
  } catch (error) {
    localSync.error = text(error?.message || error).slice(0, 500);
  }
}

const result = {
  success: true,
  contract: CONTRACT,
  generated_at: new Date().toISOString(),
  repository: REPOSITORY,
  branch: "main",
  repository_evidence_path: REPOSITORY_EVIDENCE_PATH,
  previous_commit: local.baseCommit,
  commit_sha: commitResult.commit_sha,
  tree_sha: commitResult.tree_sha,
  governed_runtime_contract: commitResult.contract,
  governed_commit_verified: true,
  exact_artifact_recovery_verified: true,
  recovery_history_limit: recoveryResult.recovery_history_limit,
  main_advanced_after_commit: recoveryResult.main_advanced_after_commit,
  local_worktree_dirty: local.worktree_dirty,
  dirty_worktree_allowed_for_certification: local.dirty_worktree_allowed,
  local_worktree_preserved: true,
  worktree_status_sha256: local.worktree_status_sha256,
  force_used: false,
  direct_git_push_used: false,
  evidence_fingerprints: Object.fromEntries(
    Object.entries(evidence).map(([name, item]) => [name, item.sha256]),
  ),
  local_sync: localSync,
  live_github_commit_performed: true,
  provider_calls_executed: false,
  provider_spend_approved: false,
  pricing_activation_performed: false,
  production_deploy_performed: false,
};

await writeFile(OUTPUT, `${JSON.stringify(result, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  output_path: OUTPUT,
  repository_evidence_path: REPOSITORY_EVIDENCE_PATH,
  previous_commit: result.previous_commit,
  commit_sha: result.commit_sha,
  governed_commit_verified: true,
  exact_artifact_recovery_verified: true,
  local_worktree_dirty: result.local_worktree_dirty,
  local_worktree_preserved: true,
  local_sync_attempted: localSync.attempted,
  local_sync_success: localSync.success,
  force_used: false,
  live_github_commit_performed: true,
  production_deploy_performed: false,
}, null, 2));
