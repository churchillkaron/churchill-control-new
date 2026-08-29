import { writeFile } from "node:fs/promises";
import { register } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const CONTRACT = "AVANTIQO_INTELLIGENCE_CODE_MISSION_PRODUCTION_FAST_ASSESSMENT_V1";
const SAFE_LEASE_CONTRACT = "AVANTIQO_RUNPOD_SAFE_LEASE_V2";
const SAFE_LEASE_LANE = "intelligence-fast";
const REPOSITORY_URL = "https://github.com/churchillkaron/churchill-control-new.git";
const MISSION_OBJECTIVE = [
  "Evaluate how Avantiqo should carry significant cross-system architecture and impact context from General Intelligence into Code Intelligence",
  "while preserving verified Self-Learning boundaries, current-repository authority, batched Code work packages, deterministic verification, and one governed implementation plan.",
  "Reuse existing shared contracts where current-main evidence supports them and do not create a second planner, memory system, impact engine, or coding agent.",
].join(" ");

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}
function yes(value) {
  return ["YES", "TRUE", "1", "APPROVED", "ON"].includes(text(value, 40).toUpperCase());
}
function shell(name, args, code) {
  const result = spawnSync(name, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error(`${code}:${text(result.stderr || result.stdout, 1000)}`);
  }
  return text(result.stdout, 200000);
}
function expectedMain() {
  const expected = text(
    process.env.AVANTIQO_INTELLIGENCE_CODE_MISSION_PRODUCTION_CERT_EXPECTED_MAIN_COMMIT,
    160,
  ).toLowerCase();
  if (!/^[a-f0-9]{40}$/.test(expected)) {
    throw new Error(`${CONTRACT}_EXPECTED_MAIN_COMMIT_REQUIRED`);
  }
  const head = shell("git", ["rev-parse", "HEAD"], `${CONTRACT}_GIT_HEAD_FAILED`).toLowerCase();
  if (head !== expected) {
    throw new Error(`${CONTRACT}_PINNED_MAIN_MISMATCH:head=${head}:expected=${expected}`);
  }
  const tracked = shell(
    "git",
    ["status", "--porcelain", "--untracked-files=no"],
    `${CONTRACT}_GIT_STATUS_FAILED`,
  );
  if (tracked) throw new Error(`${CONTRACT}_TRACKED_WORKTREE_MUST_BE_CLEAN`);
  return head;
}
function requireSafeLease() {
  if (!yes(process.env.AVANTIQO_INTELLIGENCE_CODE_MISSION_PRODUCTION_CERT_SPEND_APPROVED)) {
    throw new Error("AVANTIQO_INTELLIGENCE_CODE_MISSION_PRODUCTION_CERT_SPEND_APPROVED=YES_REQUIRED");
  }
  if (text(process.env.NODE_ENV, 40).toLowerCase() !== "development") {
    throw new Error(`${CONTRACT}_DEVELOPMENT_ENV_REQUIRED`);
  }
  if (text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_ACTIVE, 40).toUpperCase() !== "YES") {
    throw new Error(`${CONTRACT}_SAFE_LEASE_ACTIVE_REQUIRED`);
  }
  if (text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_CONTRACT, 120) !== SAFE_LEASE_CONTRACT) {
    throw new Error(`${CONTRACT}_SAFE_LEASE_V2_REQUIRED`);
  }
  if (text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_LANE, 120) !== SAFE_LEASE_LANE) {
    throw new Error(`${CONTRACT}_SAFE_LEASE_LANE_MISMATCH`);
  }
  const leaseEndpointId = text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_ENDPOINT_ID, 240);
  const configuredEndpointId = text(process.env.RUNPOD_AVANTIQO_INTELLIGENCE_FAST_ENDPOINT_ID, 240);
  if (!leaseEndpointId || !configuredEndpointId || leaseEndpointId !== configuredEndpointId) {
    throw new Error(`${CONTRACT}_SAFE_LEASE_ENDPOINT_MISMATCH`);
  }
  const expiresAt = Date.parse(text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_EXPIRES_AT, 160));
  if (!Number.isFinite(expiresAt) || expiresAt - Date.now() < 180000) {
    throw new Error(`${CONTRACT}_SAFE_LEASE_EXPIRY_INSUFFICIENT`);
  }
}

const organizationId = text(
  process.env.AVANTIQO_INTELLIGENCE_CODE_MISSION_PRODUCTION_CERT_ORGANIZATION_ID,
  200,
);
const outputPath = resolve(
  text(process.env.AVANTIQO_INTELLIGENCE_CODE_MISSION_PRODUCTION_CERT_ASSESSMENT_PATH, 1000) ||
    "/tmp/avantiqo-intelligence-code-mission-production-assessment.json",
);
if (!organizationId) throw new Error(`${CONTRACT}_ORGANIZATION_ID_REQUIRED`);
const head = expectedMain();
requireSafeLease();

process.env.AVANTIQO_CODE_CERTIFICATION_EXPECTED_MAIN_COMMIT = head;
process.env.AVANTIQO_CODE_WORKSPACE_TARGET = "LOCAL_COMPUTER";
process.env.AVANTIQO_CODE_LOCAL_REPOSITORY_ROOT = process.cwd();
register("./scripts/next-alias-loader.mjs", pathToFileURL("./"));
const { assessAvantiqoCurrentRepository } = await import(
  "@/lib/intelligence/runtime/AvantiqoProductRepositoryAssessmentRuntime"
);

const assessment = await assessAvantiqoCurrentRepository({
  context: {
    organizationId,
    metadata: {
      production_service_certification: true,
    },
  },
  repositoryUrl: REPOSITORY_URL,
  ref: "main",
  verifiedCommitSha: head,
  focus: MISSION_OBJECTIVE,
  workspaceTarget: "LOCAL_COMPUTER",
});

if (assessment?.contract !== "AVANTIQO_PRODUCT_REPOSITORY_ASSESSMENT_V1") {
  throw new Error(`${CONTRACT}_ASSESSMENT_CONTRACT_INVALID`);
}
if (text(assessment?.repository_snapshot?.current_main_head, 160).toLowerCase() !== head) {
  throw new Error(`${CONTRACT}_ASSESSMENT_HEAD_MISMATCH`);
}
if (assessment?.repository_snapshot?.clean_checkout !== true) {
  throw new Error(`${CONTRACT}_ASSESSMENT_CLEAN_CHECKOUT_REQUIRED`);
}
if (text(assessment?.repository_snapshot?.workspace_target, 80).toUpperCase() !== "LOCAL_COMPUTER") {
  throw new Error(`${CONTRACT}_LOCAL_WORKSPACE_REQUIRED`);
}
if (!text(assessment?.objective_selection?.selected_objective, 4000)) {
  throw new Error(`${CONTRACT}_ASSESSMENT_OBJECTIVE_REQUIRED`);
}

await writeFile(outputPath, `${JSON.stringify(assessment, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  repository_head: head,
  repository_ref: "main",
  local_workspace_certification_pin_active: true,
  vercel_sandbox_required: false,
  assessment_contract: assessment.contract,
  assessment_status: assessment.status,
  output_path: outputPath,
  expected_service_accounted_provider_requests: 1,
  expected_execution_lane: "fast",
  source_mutation_performed: false,
  code_execution_performed: false,
  production_deploy_performed: false,
  learning_knowledge_promoted: false,
  direct_endpoint_scaling_performed: false,
  safe_lease_exclusively_owns_scaling: true,
  raw_reasoning_persisted: false,
  organization_id_printed: false,
  secrets_printed: false,
}, null, 2));
console.log(`${CONTRACT}=PASS`);
