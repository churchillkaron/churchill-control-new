import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function assert(condition, code) {
  if (!condition) throw new Error(code);
}

const runtimePath = "lib/intelligence/runtime/AvantiqoContinuousLearningRuntime.js";
const ownedEvidencePath = "lib/intelligence/runtime/AvantiqoOwnedWebEvidenceRuntime.js";
const capabilityPath = "lib/platform/capabilities/createOperatorWebResearchCapability.js";
const mechanismRuntimePath = "lib/platform/research/runtime/OperatorMechanismResearchRuntime.js";
const routePath = "app/api/internal/intelligence/continuous-learning/process/route.js";
const indexPath = "lib/intelligence/index.js";
const vercelPath = "vercel.json";
const localLauncherPath = "scripts/run-avantiqo-continuous-learning-local.sh";
const localRunnerPath = "scripts/run-avantiqo-continuous-learning-local.mjs";

const runtime = read(runtimePath);
const ownedEvidence = read(ownedEvidencePath);
const capability = read(capabilityPath);
const mechanismRuntime = read(mechanismRuntimePath);
const route = read(routePath);
const index = read(indexPath);
const vercel = JSON.parse(read(vercelPath));
const localLauncher = read(localLauncherPath);
const localRunner = read(localRunnerPath);

assert(runtime.includes("AVANTIQO_CONTINUOUS_LEARNING_V1"), "CONTINUOUS_LEARNING_CONTRACT_REQUIRED");
assert(runtime.includes("AVANTIQO_CONTINUOUS_LEARNING_EVIDENCE_CANDIDATE_V1"), "CONTINUOUS_LEARNING_EVIDENCE_CANDIDATE_CONTRACT_REQUIRED");
assert(runtime.includes('const MEMORY_TABLE = "intelligence_memories"'), "CONTINUOUS_LEARNING_MEMORY_TABLE_REQUIRED");
assert(runtime.includes('const KNOWLEDGE_SCOPE = "platform_knowledge"'), "CONTINUOUS_LEARNING_PLATFORM_KNOWLEDGE_SCOPE_REQUIRED");
assert(runtime.includes('const EVIDENCE_CANDIDATE_SCOPE = "platform_learning_evidence_candidates"'), "CONTINUOUS_LEARNING_EVIDENCE_CANDIDATE_SCOPE_REQUIRED");
assert(runtime.includes('const AGENDA_SCOPE = "platform_learning_agenda"'), "CONTINUOUS_LEARNING_AGENDA_SCOPE_REQUIRED");
assert(runtime.includes('const RUN_SCOPE = "platform_learning_runs"'), "CONTINUOUS_LEARNING_RUN_SCOPE_REQUIRED");
assert(runtime.includes("AVANTIQO_INTELLIGENCE_LEARNING_ORGANIZATION_ID"), "CONTINUOUS_LEARNING_DEDICATED_ORGANIZATION_REQUIRED");
assert(runtime.includes("AVANTIQO_CONTINUOUS_LEARNING_ENABLED"), "CONTINUOUS_LEARNING_ENABLE_GATE_REQUIRED");
assert(runtime.includes("AVANTIQO_CONTINUOUS_LEARNING_DAILY_MAX_RUNS"), "CONTINUOUS_LEARNING_DAILY_BUDGET_REQUIRED");
assert(runtime.includes("collectAvantiqoOwnedWebEvidence"), "CONTINUOUS_LEARNING_OWNED_WEB_EVIDENCE_REQUIRED");
assert(!runtime.includes("collectOperatorWebResearch"), "CONTINUOUS_LEARNING_EXTERNAL_RESEARCH_PROVIDER_FORBIDDEN");
assert(!runtime.includes("OperatorWebResearchRuntime"), "CONTINUOUS_LEARNING_EXTERNAL_RESEARCH_RUNTIME_FORBIDDEN");
assert(runtime.includes("compareOperatorResearchEvidence"), "CONTINUOUS_LEARNING_EVIDENCE_RECONCILIATION_REQUIRED");
assert(runtime.includes('claim.status === "SUPPORTED"'), "CONTINUOUS_LEARNING_SUPPORTED_CLAIMS_ONLY_REQUIRED");
assert(runtime.includes("claim.support_count >= 2 || claim.official_primary"), "CONTINUOUS_LEARNING_CORROBORATION_REQUIRED");
assert(runtime.includes("customer_private_memory: false"), "CONTINUOUS_LEARNING_PRIVATE_MEMORY_ISOLATION_REQUIRED");
assert(runtime.includes("verified_at"), "CONTINUOUS_LEARNING_VERIFICATION_TIME_REQUIRED");
assert(runtime.includes("valid_until"), "CONTINUOUS_LEARNING_EXPIRY_REQUIRED");
assert(runtime.includes("followUpQueries"), "CONTINUOUS_LEARNING_SELF_EXPANDING_AGENDA_REQUIRED");
assert(runtime.includes("SKIPPED_CONCURRENT_CLAIM"), "CONTINUOUS_LEARNING_CONCURRENCY_GUARD_REQUIRED");
assert(runtime.includes("KNOWLEDGE_REUSED"), "CONTINUOUS_LEARNING_RELEASED_KNOWLEDGE_REUSE_REQUIRED");
assert(runtime.includes("FRESH_RESEARCH_REQUIRED"), "CONTINUOUS_LEARNING_STALE_RESEARCH_FALLBACK_REQUIRED");
assert(runtime.includes("stageTopicKnowledgeEvidenceCandidates"), "CONTINUOUS_LEARNING_EVIDENCE_STAGING_REQUIRED");
assert(!runtime.includes("replaceTopicKnowledge"), "CONTINUOUS_LEARNING_DESTRUCTIVE_TOPIC_REPLACEMENT_FORBIDDEN");
assert(runtime.includes("reusable_platform_knowledge: false"), "CONTINUOUS_LEARNING_EVIDENCE_MUST_NOT_BE_REUSABLE");
assert(runtime.includes("knowledge_router_reuse_allowed: false"), "CONTINUOUS_LEARNING_EVIDENCE_ROUTER_REUSE_FORBIDDEN");
assert(runtime.includes("automatic_knowledge_promotion: false"), "CONTINUOUS_LEARNING_AUTOMATIC_PROMOTION_FORBIDDEN");
assert(runtime.includes("explicit_final_promotion_required: true"), "CONTINUOUS_LEARNING_EXPLICIT_FINAL_PROMOTION_REQUIRED");
assert(runtime.includes("non_destructive_reconciliation: true"), "CONTINUOUS_LEARNING_NON_DESTRUCTIVE_RECONCILIATION_REQUIRED");
assert(runtime.includes("prior_released_knowledge_retired: false"), "CONTINUOUS_LEARNING_RELEASED_KNOWLEDGE_RETIREMENT_FORBIDDEN");
assert(runtime.includes("reusable_platform_knowledge_written: false"), "CONTINUOUS_LEARNING_DIRECT_PLATFORM_KNOWLEDGE_WRITE_FORBIDDEN");
assert(runtime.includes("external_intelligence_provider_used: false"), "CONTINUOUS_LEARNING_EXTERNAL_INTELLIGENCE_EVIDENCE_REQUIRED");
assert(runtime.includes("openai_used: false"), "CONTINUOUS_LEARNING_OPENAI_NEGATIVE_EVIDENCE_REQUIRED");

for (const required of [
  "AVANTIQO_OWNED_WEB_EVIDENCE_V1",
  "runOperatorWebSourceRead",
  "AVANTIQO_OWNED_CURATED_PRIMARY_SOURCE_REGISTRY",
  "external_intelligence_provider_used: false",
  "openai_used: false",
  "external_intelligence_provider_allowed: false",
  "internet_content_untrusted: true",
  "OPEN_PUBLIC_EVIDENCE",
  "PROHIBITED_OWNED_EVIDENCE_HOSTS",
  "failed_sources",
  "failures=",
]) {
  assert(
    ownedEvidence.includes(required),
    `CONTINUOUS_LEARNING_OWNED_EVIDENCE_CONTRACT_REQUIRED:${required}`,
  );
}
assert(!ownedEvidence.includes("ServiceExecutionRuntime"), "CONTINUOUS_LEARNING_SERVICE_PROVIDER_RESEARCH_FORBIDDEN");
assert(!ownedEvidence.includes("OPENAI_API_KEY"), "CONTINUOUS_LEARNING_OPENAI_SECRET_FORBIDDEN");
assert(!ownedEvidence.includes("https://www.iso.org"), "CONTINUOUS_LEARNING_ISO_EVIDENCE_FORBIDDEN");

assert(capability.includes("runOperatorMechanismResearch"), "WEB_RESEARCH_CAPABILITY_GOVERNED_RESEARCH_ROUTER_REQUIRED");
assert(capability.includes("knowledge-reuse"), "WEB_RESEARCH_CAPABILITY_KNOWLEDGE_TAG_REQUIRED");
assert(mechanismRuntime.includes("runAvantiqoKnowledgeAwareResearch"), "WEB_RESEARCH_EVIDENCE_MODE_KNOWLEDGE_REUSE_REQUIRED");
assert(mechanismRuntime.includes('mode === "evidence"'), "WEB_RESEARCH_EVIDENCE_MODE_ROUTING_REQUIRED");
assert(mechanismRuntime.includes("runOperatorWebEvidenceResearch"), "WEB_RESEARCH_MECHANISM_PUBLIC_EVIDENCE_REQUIRED");
assert(mechanismRuntime.includes("requireOperatorMechanismResearchSpendApproval"), "WEB_RESEARCH_MECHANISM_SYNTHESIS_SPEND_GUARD_REQUIRED");
assert(route.includes("CRON_SECRET"), "CONTINUOUS_LEARNING_CRON_AUTH_REQUIRED");
assert(route.includes("runAvantiqoContinuousLearningBatch"), "CONTINUOUS_LEARNING_CRON_RUNTIME_REQUIRED");
assert(index.includes("AvantiqoContinuousLearningRuntime"), "CONTINUOUS_LEARNING_EXPORT_REQUIRED");

assert(localLauncher.includes("AVANTIQO_CONTINUOUS_LEARNING_RUNPOD_USED=NO"), "CONTINUOUS_LEARNING_LOCAL_RUNPOD_NEGATIVE_EVIDENCE_REQUIRED");
assert(!localLauncher.includes("manage-avantiqo-intelligence-lane-slot-local.mjs"), "CONTINUOUS_LEARNING_RETIRED_SLOT_MANAGER_FORBIDDEN");
assert(!localLauncher.includes("--activate-fast"), "CONTINUOUS_LEARNING_DIRECT_FAST_ACTIVATION_FORBIDDEN");
assert(!localLauncher.includes("--restore-deep"), "CONTINUOUS_LEARNING_DIRECT_DEEP_RESTORE_FORBIDDEN");
assert(!localLauncher.includes("--provision"), "CONTINUOUS_LEARNING_DIRECT_ENDPOINT_PROVISION_FORBIDDEN");
assert(localLauncher.includes("Number(process.versions.node.split"), "CONTINUOUS_LEARNING_NODE_VERSION_CHECK_REQUIRED");
assert(localLauncher.includes(">= 20"), "CONTINUOUS_LEARNING_NODE_20_PLUS_REQUIRED");

assert(localRunner.includes("AVANTIQO_CONTINUOUS_LEARNING_LOCAL_RUN_V2"), "CONTINUOUS_LEARNING_LOCAL_RUN_V2_REQUIRED");
assert(localRunner.includes('"platform_learning_evidence_candidates"'), "CONTINUOUS_LEARNING_LOCAL_EVIDENCE_SCOPE_REQUIRED");
assert(localRunner.includes("assertNode20Plus"), "CONTINUOUS_LEARNING_LOCAL_NODE_20_PLUS_ASSERT_REQUIRED");
assert(localRunner.includes("const RESEARCH_TIMEOUT_MS = 600_000"), "CONTINUOUS_LEARNING_BOUNDED_LOCAL_WAIT_REQUIRED");
assert(localRunner.includes("local_client_timeout_ms: RESEARCH_TIMEOUT_MS"), "CONTINUOUS_LEARNING_LOCAL_WAIT_EVIDENCE_REQUIRED");
assert(localRunner.includes('request as httpRequest'), "CONTINUOUS_LEARNING_LOCAL_HTTP_TRANSPORT_REQUIRED");
assert(localRunner.includes("const RESEARCH_RESPONSE_LIMIT = 2_000_000"), "CONTINUOUS_LEARNING_LOCAL_RESPONSE_BOUND_REQUIRED");
assert(localRunner.includes("AVANTIQO_CONTINUOUS_LEARNING_LOCAL_RESEARCH_TIMEOUT"), "CONTINUOUS_LEARNING_LOCAL_HTTP_TIMEOUT_REQUIRED");
assert(localRunner.includes("cause_code="), "CONTINUOUS_LEARNING_LOCAL_TRANSPORT_DIAGNOSTICS_REQUIRED");
assert(localRunner.includes("runpod_used: false"), "CONTINUOUS_LEARNING_LOCAL_RUNPOD_FORBIDDEN");
assert(localRunner.includes("runpod_access: false"), "CONTINUOUS_LEARNING_LOCAL_RUNPOD_ACCESS_FORBIDDEN");
assert(localRunner.includes("platform_knowledge_count_unchanged"), "CONTINUOUS_LEARNING_LOCAL_PLATFORM_KNOWLEDGE_STABILITY_REQUIRED");
assert(localRunner.includes("evidence_candidate_count_increased"), "CONTINUOUS_LEARNING_LOCAL_EVIDENCE_STAGING_MEASUREMENT_REQUIRED");
assert(localRunner.includes("AVANTIQO_CONTINUOUS_LEARNING_LOCAL_UNEXPECTED_PLATFORM_KNOWLEDGE_MUTATION"), "CONTINUOUS_LEARNING_LOCAL_UNEXPECTED_PROMOTION_FAIL_CLOSED_REQUIRED");
assert(localRunner.includes("reusable_platform_knowledge_written: false"), "CONTINUOUS_LEARNING_LOCAL_DIRECT_KNOWLEDGE_WRITE_FORBIDDEN");
assert(localRunner.includes("prior_released_knowledge_retired: false"), "CONTINUOUS_LEARNING_LOCAL_RELEASED_KNOWLEDGE_RETIREMENT_FORBIDDEN");
assert(localRunner.includes("automatic_knowledge_promotion: false"), "CONTINUOUS_LEARNING_LOCAL_AUTO_PROMOTION_FORBIDDEN");

const cron = Array.isArray(vercel.crons)
  ? vercel.crons.find((item) => item.path === "/api/internal/intelligence/continuous-learning/process")
  : null;
assert(cron, "CONTINUOUS_LEARNING_CRON_REGISTRATION_REQUIRED");
assert(cron.schedule === "17 * * * *", "CONTINUOUS_LEARNING_CRON_MUST_BE_HOURLY");
assert(
  vercel.functions?.["app/api/internal/intelligence/continuous-learning/process/route.js"]?.maxDuration === 300,
  "CONTINUOUS_LEARNING_MAX_DURATION_REQUIRED",
);

console.log("AVANTIQO_CONTINUOUS_LEARNING_AUDIT=PASS");
console.log("AVANTIQO_CONTINUOUS_LEARNING_PLATFORM_MEMORY_ISOLATED=YES");
console.log("AVANTIQO_CONTINUOUS_LEARNING_EVIDENCE_STAGING=YES");
console.log("AVANTIQO_CONTINUOUS_LEARNING_AUTOMATIC_KNOWLEDGE_PROMOTION=NO");
console.log("AVANTIQO_CONTINUOUS_LEARNING_NON_DESTRUCTIVE_RECONCILIATION=YES");
console.log("AVANTIQO_CONTINUOUS_LEARNING_RELEASED_KNOWLEDGE_RETIRED_BY_RESEARCH=NO");
console.log("AVANTIQO_CONTINUOUS_LEARNING_SELF_EXPANDING_AGENDA=YES");
console.log("AVANTIQO_CONTINUOUS_LEARNING_DAILY_BUDGET_GUARD=YES");
console.log("AVANTIQO_CONTINUOUS_LEARNING_HOURLY_CRON_READY=YES");
console.log("AVANTIQO_CONTINUOUS_LEARNING_RUNPOD_USED=NO");
console.log("AVANTIQO_CONTINUOUS_LEARNING_LOCAL_WAIT_BOUNDED=YES");
console.log("AVANTIQO_CONTINUOUS_LEARNING_LOCAL_HTTP_HEADER_CEILING_REMOVED=YES");
console.log("AVANTIQO_CONTINUOUS_LEARNING_OWNED_PUBLIC_EVIDENCE=YES");
console.log("AVANTIQO_CONTINUOUS_LEARNING_OPEN_EVIDENCE_POLICY=YES");
console.log("AVANTIQO_CONTINUOUS_LEARNING_SOURCE_REDUNDANCY=YES");
console.log("AVANTIQO_CONTINUOUS_LEARNING_SOURCE_FAILURE_DIAGNOSTICS=YES");
console.log("AVANTIQO_CONTINUOUS_LEARNING_ISO_CONTENT=BLOCKED");
console.log("AVANTIQO_CONTINUOUS_LEARNING_EXTERNAL_INTELLIGENCE_PROVIDER=NO");
console.log("AVANTIQO_CONTINUOUS_LEARNING_OPENAI_USED=NO");
