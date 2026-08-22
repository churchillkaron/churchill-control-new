import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [
  runtimeSource,
  evidenceSource,
  cognitionPolicySource,
  thesisRuntimeSource,
  repositorySource,
  cronRouteSource,
  alertRouteSource,
  settingsRouteSource,
  bridgeSource,
  controlCenterSource,
  workspaceSource,
  vercelSource,
] = await Promise.all([
  readFile("lib/operator/runtime/OperatorAutonomousWatchRuntime.js", "utf8"),
  readFile("lib/operator/runtime/OperatorAutonomousEvidenceRuntime.js", "utf8"),
  readFile("lib/operator/runtime/OperatorAutonomousCognitionPolicy.js", "utf8"),
  readFile("lib/operator/runtime/OperatorBusinessThesisRuntime.js", "utf8"),
  readFile("lib/operator/runtime/OperatorWatchStateRepository.js", "utf8"),
  readFile("app/api/internal/operator/autonomous-watch/process/route.js", "utf8"),
  readFile("app/api/operator/autonomous-watch/alert/route.js", "utf8"),
  readFile("app/api/operator/autonomous-watch/settings/route.js", "utf8"),
  readFile("components/operator/AutonomousWatchAlertBridge.jsx", "utf8"),
  readFile("components/operator/SyntheticIntelligenceControlCenter.jsx", "utf8"),
  readFile("app/(system)/workspace/[organizationId]/page.jsx", "utf8"),
  readFile("vercel.json", "utf8"),
]);

assert.match(runtimeSource, /scanOperatorAutonomousEvidence/);
assert.match(runtimeSource, /synthesizeOperatorBusinessThesis/);
assert.match(runtimeSource, /evaluateAutonomousCognitionBudget/);
assert.match(runtimeSource, /cognitionBudgetSummary/);
assert.match(runtimeSource, /buildOperatorBusinessThesis/);
assert.match(runtimeSource, /mutateOperatorWatchProjectState/);
assert.match(runtimeSource, /WATCH_VERSION = 2/);
assert.match(runtimeSource, /RUN_LEASE_MS = 10 \* 60 \* 1000/);
assert.match(runtimeSource, /autonomous_read_only_cost_aware/);
assert.match(runtimeSource, /EVIDENCE_UNCHANGED/);
assert.match(runtimeSource, /deterministic_reuse/);
assert.match(runtimeSource, /deterministic_budget_guard/);
assert.match(runtimeSource, /paid_semantic_reasoning/);
assert.match(runtimeSource, /paid_reasoning_used/);
assert.match(runtimeSource, /paid_reasoning_count/);
assert.match(runtimeSource, /deterministic_only_count/);
assert.match(runtimeSource, /deferredThesis/);
assert.match(runtimeSource, /CONCURRENT_THESIS_UPDATE/);
assert.match(runtimeSource, /concurrent_semantic_preservation/);
assert.match(runtimeSource, /claimWatchRun/);
assert.match(runtimeSource, /crypto\.randomUUID\(\)/);
assert.match(runtimeSource, /activeLease/);
assert.match(runtimeSource, /ACTIVE_RUN_LEASE/);
assert.match(runtimeSource, /run_lease:\s*null/);
assert.match(runtimeSource, /selectOrganizationOwnerWatchers/);
assert.match(runtimeSource, /FULL_ACCESS_ROLES\.has\(normalizeRole\(access\.role\)\)/);
assert.match(runtimeSource, /selected_owner_watchers/);
assert.match(runtimeSource, /lease_contention_count/);
assert.match(runtimeSource, /\.order\("organization_id", \{ ascending: true \}\)/);
assert.match(runtimeSource, /\.order\("id", \{ ascending: true \}\)/);
assert.match(runtimeSource, /DEFAULT_BATCH_LIMIT = 2/);
assert.match(runtimeSource, /MAX_BATCH_LIMIT = 4/);
assert.match(runtimeSource, /urgent:\s*15 \* 60 \* 1000/);
assert.match(runtimeSource, /important:\s*30 \* 60 \* 1000/);
assert.match(runtimeSource, /watch:\s*60 \* 60 \* 1000/);
assert.match(runtimeSource, /clear:\s*3 \* 60 \* 60 \* 1000/);
assert.match(runtimeSource, /consecutive_failures/);
assert.match(runtimeSource, /2 \*\* Math\.min\(failures, 5\)/);
assert.match(runtimeSource, /last_queued_dedupe_key/);
assert.match(runtimeSource, /pending_alert/);
assert.match(runtimeSource, /alert_history/);
assert.match(runtimeSource, /last_cognition/);
assert.match(runtimeSource, /resolveWatcherAccess/);
assert.match(runtimeSource, /staff_accounts/);
assert.match(runtimeSource, /organization_users/);
assert.match(runtimeSource, /party_id/);
assert.match(runtimeSource, /organization_id/);
assert.match(runtimeSource, /permissionSet/);
assert.match(runtimeSource, /thesisChangedDuringScan/);
assert.match(runtimeSource, /rebased_against_live_state/);
assert.match(runtimeSource, /persistence_attempts/);
assert.doesNotMatch(runtimeSource, /scanOperatorAttention/);
assert.doesNotMatch(runtimeSource, /forceRefresh:\s*true/);
assert.doesNotMatch(runtimeSource, /updateIntelligenceConversationState/);
assert.doesNotMatch(runtimeSource, /last_message_at\s*:/);
assert.doesNotMatch(runtimeSource, /permissions:\s*\["\*"\]/);
assert.doesNotMatch(runtimeSource, /fullAccess:\s*true/);
assert.doesNotMatch(runtimeSource, /executeUbteCapability/);
assert.doesNotMatch(runtimeSource, /operator_mission/);
assert.doesNotMatch(runtimeSource, /pending_execution\s*:/);

assert.match(evidenceSource, /executeUbteCapability/);
assert.match(evidenceSource, /operator_read_chain/);
assert.match(evidenceSource, /safeRead/);
assert.match(evidenceSource, /requiredInputs\(capability\)\.length === 0/);
assert.match(evidenceSource, /capability\?\.transactional !== true/);
assert.match(evidenceSource, /capability\?\.requires_confirmation !== true/);
assert.match(evidenceSource, /accessibleCapability/);
assert.match(evidenceSource, /MAX_PLAN_STEPS = 4/);
assert.match(evidenceSource, /MIN_PLAN_STEPS = 2/);
assert.match(evidenceSource, /deterministic_evidence_only/);
assert.doesNotMatch(evidenceSource, /ServiceExecutionRuntime/);
assert.doesNotMatch(evidenceSource, /ai\.text\.generate/);
assert.doesNotMatch(evidenceSource, /executeProvider/);

assert.match(cognitionPolicySource, /WalletRepository\.getByOrganization/);
assert.match(cognitionPolicySource, /OrganizationServiceRuntime\.get/);
assert.match(cognitionPolicySource, /resolveProvider/);
assert.match(cognitionPolicySource, /PricingRuntime\.resolveRecord/);
assert.match(cognitionPolicySource, /estimateNextReasoningPrice/);
assert.match(cognitionPolicySource, /platform_service_usage/);
assert.match(cognitionPolicySource, /WINDOW_MS = 24 \* 60 \* 60 \* 1000/);
assert.match(cognitionPolicySource, /customer_spend_limit/);
assert.match(cognitionPolicySource, /paid_reasoning_pass_limit/);
assert.match(cognitionPolicySource, /minimum_wallet_balance/);
assert.match(cognitionPolicySource, /deep_reasoning_on_change/);
assert.match(cognitionPolicySource, /metadata\.autonomous_cognition !== true/);
assert.match(cognitionPolicySource, /SYNTHESIZE_BUSINESS_THESIS/);
assert.doesNotMatch(cognitionPolicySource, /SYNTHESIZE_ATTENTION/);
assert.match(cognitionPolicySource, /spendAfterNext/);
assert.match(cognitionPolicySource, /balanceAfterNext/);
assert.match(cognitionPolicySource, /AUTONOMOUS_COGNITION_SPEND_BUDGET_WOULD_EXCEED/);
assert.match(cognitionPolicySource, /AUTONOMOUS_COGNITION_WALLET_FLOOR_WOULD_BREACH/);
assert.match(cognitionPolicySource, /AUTONOMOUS_COGNITION_WALLET_INSUFFICIENT_FOR_ESTIMATE/);
assert.match(cognitionPolicySource, /AUTONOMOUS_COGNITION_BUDGET_CURRENCY_MISMATCH/);
assert.match(cognitionPolicySource, /estimated_next_reasoning_price/);
assert.match(cognitionPolicySource, /estimated_spend_after_next/);
assert.match(cognitionPolicySource, /estimated_wallet_balance_after_next/);
assert.match(cognitionPolicySource, /PREPAID/);
assert.doesNotMatch(cognitionPolicySource, /getOrCreate/);
assert.doesNotMatch(cognitionPolicySource, /WalletRuntime\.reserve/);
assert.doesNotMatch(cognitionPolicySource, /WalletRuntime\.charge/);

assert.match(thesisRuntimeSource, /autonomousCognition/);
assert.match(thesisRuntimeSource, /deterministic_evidence_only/);
assert.match(thesisRuntimeSource, /autonomous_cognition:\s*autonomousCognition/);
assert.match(thesisRuntimeSource, /autonomous_watch_version/);
assert.match(thesisRuntimeSource, /latency_class:\s*autonomousCognition \? "background" : "interactive"/);
assert.match(thesisRuntimeSource, /SYNTHESIZE_BUSINESS_THESIS/);
assert.match(thesisRuntimeSource, /ServiceExecutionRuntime\.execute/);

assert.match(repositorySource, /MAX_RETRIES = 4/);
assert.match(repositorySource, /mutateOperatorWatchProjectState/);
assert.match(repositorySource, /mutationObject\.skip === true/);
assert.match(repositorySource, /project_state:\s*object\(projectState\)/);
assert.match(repositorySource, /updated_at:\s*updatedAt/);
assert.match(repositorySource, /eq\("updated_at", expectedUpdatedAt\)/);
assert.match(repositorySource, /is\("updated_at", null\)/);
assert.match(repositorySource, /maybeSingle\(\)/);
assert.match(repositorySource, /CONCURRENT_UPDATE_RETRY_EXHAUSTED/);
assert.match(repositorySource, /last_message_at/);
assert.doesNotMatch(repositorySource, /last_message_at\s*:/);

assert.match(cronRouteSource, /CRON_SECRET/);
assert.match(cronRouteSource, /authorization/);
assert.match(cronRouteSource, /Bearer \$\{secret\}/);
assert.match(cronRouteSource, /runOperatorAutonomousWatchBatch/);
assert.match(cronRouteSource, /maxDuration = 300/);
assert.match(cronRouteSource, /Math\.min\([^]*\|\| 2, 4\)/);

assert.match(alertRouteSource, /requireOrganizationAccess/);
assert.match(alertRouteSource, /loadIntelligenceConversationSnapshot/);
assert.match(alertRouteSource, /mutateOperatorWatchProjectState/);
assert.match(alertRouteSource, /conversationKey:\s*"primary"/);
assert.match(alertRouteSource, /pendingAlert/);
assert.match(alertRouteSource, /last_delivered_dedupe_key/);
assert.match(alertRouteSource, /status:\s*"delivered"/);
assert.match(alertRouteSource, /persistence_attempts/);
assert.doesNotMatch(alertRouteSource, /updateIntelligenceConversationState/);
assert.doesNotMatch(alertRouteSource, /last_message_at\s*:/);
assert.doesNotMatch(alertRouteSource, /service_role/i);
assert.doesNotMatch(alertRouteSource, /executeUbteCapability/);

assert.match(settingsRouteSource, /requireOrganizationAccess/);
assert.match(settingsRouteSource, /loadIntelligenceConversationSnapshot/);
assert.match(settingsRouteSource, /mutateOperatorWatchProjectState/);
assert.match(settingsRouteSource, /FULL_ACCESS_ROLES/);
assert.match(settingsRouteSource, /Organization owner access is required/);
assert.match(settingsRouteSource, /cognition_budget/);
assert.match(settingsRouteSource, /customer_spend_limit/);
assert.match(settingsRouteSource, /paid_reasoning_pass_limit/);
assert.match(settingsRouteSource, /minimum_wallet_balance/);
assert.match(settingsRouteSource, /deep_reasoning_on_change/);
assert.match(settingsRouteSource, /evaluateAutonomousCognitionBudget/);
assert.match(settingsRouteSource, /persistence_attempts/);
assert.doesNotMatch(settingsRouteSource, /executeUbteCapability/);
assert.doesNotMatch(settingsRouteSource, /updateIntelligenceConversationState/);
assert.doesNotMatch(settingsRouteSource, /last_message_at\s*:/);

assert.match(bridgeSource, /POLL_INTERVAL_MS = 30_000/);
assert.match(bridgeSource, /\/api\/operator\/autonomous-watch\/alert/);
assert.match(bridgeSource, /avantiqo:speak/);
assert.match(bridgeSource, /synthetic-intelligence-autonomous-watch/);
assert.match(bridgeSource, /sessionStorage/);
assert.match(bridgeSource, /avantiqo:home-command/);
assert.match(bridgeSource, /Discuss/);
assert.match(bridgeSource, /Seen/);
assert.match(bridgeSource, /not authorization/i);

assert.match(controlCenterSource, /REFRESH_INTERVAL_MS = 60_000/);
assert.match(controlCenterSource, /FULL_ACCESS_ROLES/);
assert.match(controlCenterSource, /data-avantiqo-synthetic-intelligence-control-center="true"/);
assert.match(controlCenterSource, /\/api\/operator\/autonomous-watch\/settings/);
assert.match(controlCenterSource, /credentials:\s*"same-origin"/);
assert.match(controlCenterSource, /cache:\s*"no-store"/);
assert.match(controlCenterSource, /Autonomous business awareness/);
assert.match(controlCenterSource, /Last cognition/);
assert.match(controlCenterSource, /Autonomous spend · 24h/);
assert.match(controlCenterSource, /Next reasoning estimate/);
assert.match(controlCenterSource, /Next autonomous check/);
assert.match(controlCenterSource, /Paid reasoning allowance/);
assert.match(controlCenterSource, /Wallet after next pass/);
assert.match(controlCenterSource, /customer_spend_limit/);
assert.match(controlCenterSource, /paid_reasoning_pass_limit/);
assert.match(controlCenterSource, /minimum_wallet_balance/);
assert.match(controlCenterSource, /deep_reasoning_on_change/);
assert.match(controlCenterSource, /Discuss policy/);
assert.match(controlCenterSource, /avantiqo:home-command/);
assert.match(controlCenterSource, /Save autonomy policy/);
assert.match(controlCenterSource, /canManage/);
assert.match(controlCenterSource, /Organization owner access required/);
assert.match(controlCenterSource, /Recommendations never authorize business execution/);
assert.doesNotMatch(controlCenterSource, /service_role/i);
assert.doesNotMatch(controlCenterSource, /executeUbteCapability/);

assert.match(workspaceSource, /AutonomousWatchAlertBridge/);
assert.match(workspaceSource, /SyntheticIntelligenceControlCenter/);
assert.match(workspaceSource, /role=\{role\}/);
assert.match(workspaceSource, /organizationId=\{organizationId\}/);

const vercel = JSON.parse(vercelSource);
const cron = (vercel.crons || []).find(
  (item) => item.path === "/api/internal/operator/autonomous-watch/process",
);
assert.ok(cron, "Autonomous watch cron must be configured");
assert.equal(cron.schedule, "*/5 * * * *");
assert.equal(
  vercel.functions?.["app/api/internal/operator/autonomous-watch/process/route.js"]?.maxDuration,
  300,
);

console.log("OPERATOR_AUTONOMOUS_WATCH_AUDIT=PASS");
console.log("OPERATOR_AUTONOMOUS_WATCH_MODE=READ_ONLY_COST_AWARE_V2");
console.log("OPERATOR_AUTONOMOUS_WATCH_SCOPE=ONE_FULL_ACCESS_OWNER_PER_ORGANIZATION");
console.log("OPERATOR_AUTONOMOUS_WATCH_EVIDENCE=DETERMINISTIC_REGISTERED_READS_ZERO_AI");
console.log("OPERATOR_AUTONOMOUS_WATCH_COGNITION=ZERO_AI_IF_UNCHANGED_ONE_PAID_PASS_IF_JUSTIFIED");
console.log("OPERATOR_AUTONOMOUS_WATCH_BUDGET=AUTONOMOUS_USAGE_ONLY_ROLLING_24H_HARD_PRICE_PREFLIGHT");
console.log("OPERATOR_AUTONOMOUS_WATCH_SETTINGS=AUTHENTICATED_OWNER_GOVERNED");
console.log("OPERATOR_AUTONOMOUS_WATCH_CONTROL_CENTER=LIVE_OWNER_GOVERNED_EXECUTIVE_UI");
console.log("OPERATOR_AUTONOMOUS_WATCH_WALLET=READ_ONLY_PRICE_PREFLIGHT_THEN_SERVICE_RUNTIME_RESERVATION");
console.log("OPERATOR_AUTONOMOUS_WATCH_RUN_LEASE=OPTIMISTIC_SINGLE_OWNER_10_MINUTE_RECOVERY");
console.log("OPERATOR_AUTONOMOUS_WATCH_CADENCE=ADAPTIVE_WITH_BACKOFF");
console.log("OPERATOR_AUTONOMOUS_WATCH_ALERTS=DURABLE_DEDUPED_ACKNOWLEDGED");
console.log("OPERATOR_AUTONOMOUS_WATCH_ACTIVITY=SEPARATE_FROM_HUMAN_CONVERSATION");
console.log("OPERATOR_AUTONOMOUS_WATCH_CONCURRENCY=LEASE_PLUS_OPTIMISTIC_PRESERVE_AND_RETRY");
console.log("OPERATOR_AUTONOMOUS_WATCH_EXECUTION=NO_BUSINESS_WRITE_AUTHORIZATION");
