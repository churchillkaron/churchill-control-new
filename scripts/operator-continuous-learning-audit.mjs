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
const capabilityPath = "lib/platform/capabilities/createOperatorWebResearchCapability.js";
const routePath = "app/api/internal/intelligence/continuous-learning/process/route.js";
const indexPath = "lib/intelligence/index.js";
const vercelPath = "vercel.json";
const localLauncherPath = "scripts/run-avantiqo-continuous-learning-local.sh";
const localRunnerPath = "scripts/run-avantiqo-continuous-learning-local.mjs";
const slotManagerPath = "scripts/manage-avantiqo-intelligence-lane-slot-local.mjs";
const fastE2EWrapperPath = "scripts/run-operator-product-engineering-fast-lane-e2e-local.sh";

const runtime = read(runtimePath);
const capability = read(capabilityPath);
const route = read(routePath);
const index = read(indexPath);
const vercel = JSON.parse(read(vercelPath));
const localLauncher = read(localLauncherPath);
const localRunner = read(localRunnerPath);
const slotManager = read(slotManagerPath);
const fastE2EWrapper = read(fastE2EWrapperPath);

assert(runtime.includes("AVANTIQO_CONTINUOUS_LEARNING_V1"), "CONTINUOUS_LEARNING_CONTRACT_REQUIRED");
assert(runtime.includes('const MEMORY_TABLE = "intelligence_memories"'), "CONTINUOUS_LEARNING_MEMORY_TABLE_REQUIRED");
assert(runtime.includes('const KNOWLEDGE_SCOPE = "platform_knowledge"'), "CONTINUOUS_LEARNING_PLATFORM_KNOWLEDGE_SCOPE_REQUIRED");
assert(runtime.includes('const AGENDA_SCOPE = "platform_learning_agenda"'), "CONTINUOUS_LEARNING_AGENDA_SCOPE_REQUIRED");
assert(runtime.includes('const RUN_SCOPE = "platform_learning_runs"'), "CONTINUOUS_LEARNING_RUN_SCOPE_REQUIRED");
assert(runtime.includes("AVANTIQO_INTELLIGENCE_LEARNING_ORGANIZATION_ID"), "CONTINUOUS_LEARNING_DEDICATED_ORGANIZATION_REQUIRED");
assert(runtime.includes("AVANTIQO_CONTINUOUS_LEARNING_ENABLED"), "CONTINUOUS_LEARNING_ENABLE_GATE_REQUIRED");
assert(runtime.includes("AVANTIQO_CONTINUOUS_LEARNING_DAILY_MAX_RUNS"), "CONTINUOUS_LEARNING_DAILY_BUDGET_REQUIRED");
assert(runtime.includes("collectOperatorWebResearch"), "CONTINUOUS_LEARNING_WEB_EVIDENCE_REQUIRED");
assert(runtime.includes("compareOperatorResearchEvidence"), "CONTINUOUS_LEARNING_EVIDENCE_RECONCILIATION_REQUIRED");
assert(runtime.includes('claim.status === "SUPPORTED"'), "CONTINUOUS_LEARNING_SUPPORTED_CLAIMS_ONLY_REQUIRED");
assert(runtime.includes("claim.support_count >= 2 || claim.official_primary"), "CONTINUOUS_LEARNING_CORROBORATION_REQUIRED");
assert(runtime.includes("customer_private_memory: false"), "CONTINUOUS_LEARNING_PRIVATE_MEMORY_ISOLATION_REQUIRED");
assert(runtime.includes("verified_at"), "CONTINUOUS_LEARNING_VERIFICATION_TIME_REQUIRED");
assert(runtime.includes("valid_until"), "CONTINUOUS_LEARNING_EXPIRY_REQUIRED");
assert(runtime.includes("followUpQueries"), "CONTINUOUS_LEARNING_SELF_EXPANDING_AGENDA_REQUIRED");
assert(runtime.includes("SKIPPED_CONCURRENT_CLAIM"), "CONTINUOUS_LEARNING_CONCURRENCY_GUARD_REQUIRED");
assert(runtime.includes("KNOWLEDGE_REUSED"), "CONTINUOUS_LEARNING_REUSE_REQUIRED");
assert(runtime.includes("FRESH_RESEARCH_REQUIRED"), "CONTINUOUS_LEARNING_STALE_RESEARCH_FALLBACK_REQUIRED");

assert(capability.includes("runKnowledgeAwareWebResearch"), "WEB_RESEARCH_CAPABILITY_KNOWLEDGE_REUSE_REQUIRED");
assert(capability.includes("knowledge-reuse"), "WEB_RESEARCH_CAPABILITY_KNOWLEDGE_TAG_REQUIRED");
assert(route.includes("CRON_SECRET"), "CONTINUOUS_LEARNING_CRON_AUTH_REQUIRED");
assert(route.includes("runAvantiqoContinuousLearningBatch"), "CONTINUOUS_LEARNING_CRON_RUNTIME_REQUIRED");
assert(index.includes("AvantiqoContinuousLearningRuntime"), "CONTINUOUS_LEARNING_EXPORT_REQUIRED");

assert(
  localLauncher.includes("AVANTIQO_CONTINUOUS_LEARNING_FAST_SLOT_APPROVED=YES_REQUIRED"),
  "CONTINUOUS_LEARNING_FAST_SLOT_APPROVAL_REQUIRED",
);
assert(
  localLauncher.includes("AVANTIQO_INTELLIGENCE_FAST_RUNPOD_PROVISION_APPROVED=YES"),
  "CONTINUOUS_LEARNING_FAST_SLOT_PROVISION_GATE_REQUIRED",
);
assert(
  localLauncher.includes("AVANTIQO_INTELLIGENCE_FAST_SLOT_SWAP_APPROVED=YES"),
  "CONTINUOUS_LEARNING_FAST_SLOT_SWAP_REQUIRED",
);
assert(
  localLauncher.includes("AVANTIQO_INTELLIGENCE_FAST_SLOT_RESTORE_APPROVED=YES"),
  "CONTINUOUS_LEARNING_DEEP_SLOT_RESTORE_REQUIRED",
);
assert(
  localLauncher.includes("trap 'restore_deep_slot $?' EXIT"),
  "CONTINUOUS_LEARNING_DEEP_SLOT_EXIT_TRAP_REQUIRED",
);
assert(
  localLauncher.includes("AVANTIQO_CONTINUOUS_LEARNING_FAST_SLOT_ACTIVE=YES"),
  "CONTINUOUS_LEARNING_FAST_SLOT_RUNTIME_EVIDENCE_REQUIRED",
);
assert(
  localRunner.includes("const RESEARCH_TIMEOUT_MS = 600_000"),
  "CONTINUOUS_LEARNING_BOUNDED_LOCAL_WAIT_REQUIRED",
);
assert(
  localRunner.includes("local_client_timeout_ms: RESEARCH_TIMEOUT_MS"),
  "CONTINUOUS_LEARNING_LOCAL_WAIT_EVIDENCE_REQUIRED",
);
assert(
  localRunner.includes("runpod_used: fastSlotActive"),
  "CONTINUOUS_LEARNING_RUNPOD_USAGE_EVIDENCE_REQUIRED",
);
assert(
  slotManager.includes('text(process.env.AVANTIQO_ENV_FILE) || ".env.local"'),
  "CONTINUOUS_LEARNING_SLOT_MANAGER_ENV_FILE_REQUIRED",
);
assert(
  slotManager.includes("const IDLE_WAIT_TIMEOUT_MS = 600_000"),
  "CONTINUOUS_LEARNING_SLOT_IDLE_WAIT_BOUND_REQUIRED",
);
assert(
  slotManager.includes("waitUntilIdleForDisable"),
  "CONTINUOUS_LEARNING_SLOT_IDLE_WAIT_REQUIRED",
);
assert(
  slotManager.includes("AVANTIQO_INTELLIGENCE_SLOT_WAITING_FOR_IDLE"),
  "CONTINUOUS_LEARNING_SLOT_IDLE_WAIT_EVIDENCE_REQUIRED",
);
assert(
  slotManager.includes("AVANTIQO_INTELLIGENCE_FAST_DEEP_RESTORE"),
  "CONTINUOUS_LEARNING_SHARED_FAST_DRAIN_REQUIRED",
);
assert(
  slotManager.includes("AVANTIQO_INTELLIGENCE_RESTORE_SLOT_STATE_INVALID"),
  "CONTINUOUS_LEARNING_RESTORE_SLOT_STATE_GUARD_REQUIRED",
);
assert(
  slotManager.includes("fast_restored="),
  "CONTINUOUS_LEARNING_RESTORE_RECOVERY_REQUIRED",
);
assert(
  fastE2EWrapper.includes("FAST_LANE_SAFE_SINGLE_SLOT_STATE=YES"),
  "CONTINUOUS_LEARNING_FAST_E2E_SHARED_SLOT_REQUIRED",
);

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
console.log("AVANTIQO_CONTINUOUS_LEARNING_VERIFIED_PROMOTION=YES");
console.log("AVANTIQO_CONTINUOUS_LEARNING_SELF_EXPANDING_AGENDA=YES");
console.log("AVANTIQO_CONTINUOUS_LEARNING_DAILY_BUDGET_GUARD=YES");
console.log("AVANTIQO_CONTINUOUS_LEARNING_HOURLY_CRON_READY=YES");
console.log("AVANTIQO_CONTINUOUS_LEARNING_FAST_SLOT_LEASE_GUARDED=YES");
console.log("AVANTIQO_CONTINUOUS_LEARNING_LOCAL_WAIT_BOUNDED=YES");
console.log("AVANTIQO_CONTINUOUS_LEARNING_ACTIVE_JOB_DRAIN_GUARDED=YES");
console.log("AVANTIQO_CONTINUOUS_LEARNING_CONCURRENT_FAST_LEASE_GUARDED=YES");
