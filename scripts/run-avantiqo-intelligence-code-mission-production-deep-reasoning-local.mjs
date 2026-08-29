import { readFile, writeFile } from "node:fs/promises";
import { register } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const CONTRACT = "AVANTIQO_INTELLIGENCE_CODE_MISSION_PRODUCTION_DEEP_REASONING_V1";
const SAFE_LEASE_CONTRACT = "AVANTIQO_RUNPOD_SAFE_LEASE_V2";
const SAFE_LEASE_LANE = "intelligence-deep";
const REPOSITORY_URL = "https://github.com/churchillkaron/churchill-control-new.git";
const MISSION = Object.freeze({
  id: "general-intelligence-production-service-accounted-cert-v1",
  objective: [
    "Evaluate how Avantiqo should carry significant cross-system architecture and impact context from General Intelligence into Code Intelligence",
    "while preserving verified Self-Learning boundaries, current-repository authority, batched Code work packages, deterministic verification, and one governed implementation plan.",
    "Reuse existing shared contracts where current-main evidence supports them and do not create a second planner, memory system, impact engine, or coding agent.",
  ].join(" "),
  business_intent:
    "Certify the real service-accounted General Intelligence path while preserving current-repository authority, governed Code handoff, prepaid accounting, and zero implementation authority in General.",
});
const LEARNED_KNOWLEDGE = Object.freeze({
  evaluated: true,
  status: "NO_RELEVANT_VERIFIED_KNOWLEDGE",
  knowledge: [],
  provenance_contracts: [],
  freshness_checked: true,
  evidence_graph_checked: true,
  fresh_research_performed: false,
});
const CANONICAL_CONTEXT = Object.freeze({
  proof_scope: "GENERAL_INTELLIGENCE_PRODUCTION_SERVICE_ACCOUNTED_V1",
  code_implementation_authorized: false,
  future_proof_architecture_not_feature_count: true,
});

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
  if (!/^[a-f0-9]{40}$/.test(expected)) throw new Error(`${CONTRACT}_EXPECTED_MAIN_COMMIT_REQUIRED`);
  const head = shell("git", ["rev-parse", "HEAD"], `${CONTRACT}_GIT_HEAD_FAILED`).toLowerCase();
  if (head !== expected) throw new Error(`${CONTRACT}_PINNED_MAIN_MISMATCH:head=${head}:expected=${expected}`);
  const tracked = shell("git", ["status", "--porcelain", "--untracked-files=no"], `${CONTRACT}_GIT_STATUS_FAILED`);
  if (tracked) throw new Error(`${CONTRACT}_TRACKED_WORKTREE_MUST_BE_CLEAN`);
  return head;
}
function requireSafeLease() {
  if (!yes(process.env.AVANTIQO_INTELLIGENCE_CODE_MISSION_PRODUCTION_CERT_SPEND_APPROVED)) {
    throw new Error("AVANTIQO_INTELLIGENCE_CODE_MISSION_PRODUCTION_CERT_SPEND_APPROVED=YES_REQUIRED");
  }
  if (text(process.env.NODE_ENV, 40).toLowerCase() !== "development") throw new Error(`${CONTRACT}_DEVELOPMENT_ENV_REQUIRED`);
  if (text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_ACTIVE, 40).toUpperCase() !== "YES") throw new Error(`${CONTRACT}_SAFE_LEASE_ACTIVE_REQUIRED`);
  if (text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_CONTRACT, 120) !== SAFE_LEASE_CONTRACT) throw new Error(`${CONTRACT}_SAFE_LEASE_V2_REQUIRED`);
  if (text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_LANE, 120) !== SAFE_LEASE_LANE) throw new Error(`${CONTRACT}_SAFE_LEASE_LANE_MISMATCH`);
  const leaseEndpointId = text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_ENDPOINT_ID, 240);
  const configuredEndpointId = text(process.env.RUNPOD_AVANTIQO_INTELLIGENCE_ENDPOINT_ID, 240);
  if (!leaseEndpointId || !configuredEndpointId || leaseEndpointId !== configuredEndpointId) throw new Error(`${CONTRACT}_SAFE_LEASE_ENDPOINT_MISMATCH`);
  const expiresAt = Date.parse(text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_EXPIRES_AT, 160));
  if (!Number.isFinite(expiresAt) || expiresAt - Date.now() < 360000) throw new Error(`${CONTRACT}_SAFE_LEASE_EXPIRY_INSUFFICIENT`);
}

const organizationId = text(process.env.AVANTIQO_INTELLIGENCE_CODE_MISSION_PRODUCTION_CERT_ORGANIZATION_ID, 200);
const assessmentPath = resolve(
  text(process.env.AVANTIQO_INTELLIGENCE_CODE_MISSION_PRODUCTION_CERT_ASSESSMENT_PATH, 1000) ||
    "/tmp/avantiqo-intelligence-code-mission-production-assessment.json",
);
const outputPath = resolve(
  text(process.env.AVANTIQO_INTELLIGENCE_CODE_MISSION_PRODUCTION_CERT_RESULT_PATH, 1000) ||
    "/tmp/avantiqo-intelligence-code-mission-production-result.json",
);
if (!organizationId) throw new Error(`${CONTRACT}_ORGANIZATION_ID_REQUIRED`);
const head = expectedMain();
requireSafeLease();

const assessment = JSON.parse(await readFile(assessmentPath, "utf8"));
if (assessment?.contract !== "AVANTIQO_PRODUCT_REPOSITORY_ASSESSMENT_V1") throw new Error(`${CONTRACT}_ASSESSMENT_CONTRACT_INVALID`);
if (text(assessment?.repository_snapshot?.current_main_head, 160).toLowerCase() !== head) throw new Error(`${CONTRACT}_ASSESSMENT_HEAD_MISMATCH`);
if (assessment?.repository_snapshot?.clean_checkout !== true) throw new Error(`${CONTRACT}_ASSESSMENT_CLEAN_CHECKOUT_REQUIRED`);

register("./scripts/next-alias-loader.mjs", pathToFileURL("./"));
const { runAvantiqoIntelligenceCodeMissionSystemReasoning } = await import(
  "@/lib/intelligence/runtime/AvantiqoIntelligenceCodeMissionSystemReasoningRuntime"
);

let assessmentReuseCalls = 0;
const result = await runAvantiqoIntelligenceCodeMissionSystemReasoning({
  context: {
    organizationId,
    metadata: {
      production_service_certification: true,
    },
  },
  mission: MISSION,
  learned_knowledge: LEARNED_KNOWLEDGE,
  canonical_context: CANONICAL_CONTEXT,
  repositoryUrl: REPOSITORY_URL,
  ref: "main",
  verifiedCommitSha: head,
  dependencies: {
    assessRepository: async () => {
      assessmentReuseCalls += 1;
      return assessment;
    },
  },
});

if (assessmentReuseCalls !== 1) throw new Error(`${CONTRACT}_ASSESSMENT_REUSE_CALL_COUNT_INVALID:${assessmentReuseCalls}`);
if (result?.contract !== "AVANTIQO_INTELLIGENCE_CODE_MISSION_SYSTEM_REASONING_V1") throw new Error(`${CONTRACT}_RESULT_CONTRACT_INVALID`);
if (result?.status !== "READY_FOR_CODE") throw new Error(`${CONTRACT}_READY_FOR_CODE_REQUIRED`);
if (result?.mission_context?.mission?.id !== MISSION.id) throw new Error(`${CONTRACT}_MISSION_ID_NOT_PRESERVED`);
if (result?.mission_context?.mission?.objective !== MISSION.objective) throw new Error(`${CONTRACT}_MISSION_OBJECTIVE_NOT_PRESERVED`);
if (text(result?.mission_context?.repository_context?.head_sha, 160).toLowerCase() !== head) throw new Error(`${CONTRACT}_REPOSITORY_HEAD_NOT_PRESERVED`);
if (result?.governance?.code_execution_started !== false) throw new Error(`${CONTRACT}_CODE_EXECUTION_GOVERNANCE_INVALID`);
if (result?.governance?.source_mutation_performed !== false) throw new Error(`${CONTRACT}_SOURCE_MUTATION_GOVERNANCE_INVALID`);
if (result?.governance?.deployment_performed !== false) throw new Error(`${CONTRACT}_DEPLOYMENT_GOVERNANCE_INVALID`);
if (result?.governance?.knowledge_promotion_performed !== false) throw new Error(`${CONTRACT}_KNOWLEDGE_PROMOTION_GOVERNANCE_INVALID`);
if (result?.governance?.raw_reasoning_persisted !== false) throw new Error(`${CONTRACT}_RAW_REASONING_PERSISTENCE_INVALID`);
if (Number(result?.reasoning_execution?.repository_assessment_reasoning_call_ceiling) !== 1) throw new Error(`${CONTRACT}_REPOSITORY_REASONING_CEILING_INVALID`);
if (Number(result?.reasoning_execution?.system_reasoning_call_ceiling) !== 3) throw new Error(`${CONTRACT}_SYSTEM_REASONING_CEILING_INVALID`);
if (Number(result?.reasoning_execution?.total_general_reasoning_call_ceiling) !== 4) throw new Error(`${CONTRACT}_TOTAL_REASONING_CEILING_INVALID`);
if (Number(result?.reasoning_execution?.code_reasoning_calls_consumed) !== 0) throw new Error(`${CONTRACT}_CODE_REASONING_CALLS_INVALID`);

await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  repository_head: head,
  result_contract: result.contract,
  status: result.status,
  assessment_reused_without_reexecution: assessmentReuseCalls === 1,
  expected_service_accounted_provider_requests: 3,
  expected_execution_lane: "deep",
  total_general_reasoning_call_ceiling: result.reasoning_execution.total_general_reasoning_call_ceiling,
  code_reasoning_calls_consumed: result.reasoning_execution.code_reasoning_calls_consumed,
  source_mutation_performed: false,
  code_execution_performed: false,
  production_deploy_performed: false,
  learning_knowledge_promoted: false,
  direct_endpoint_scaling_performed: false,
  safe_lease_exclusively_owns_scaling: true,
  raw_reasoning_persisted: false,
  organization_id_printed: false,
  secrets_printed: false,
  output_path: outputPath,
}, null, 2));
console.log(`${CONTRACT}=PASS`);
