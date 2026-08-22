import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [
  runtimeSource,
  cronRouteSource,
  alertRouteSource,
  bridgeSource,
  workspaceSource,
  vercelSource,
] = await Promise.all([
  readFile("lib/operator/runtime/OperatorAutonomousWatchRuntime.js", "utf8"),
  readFile("app/api/internal/operator/autonomous-watch/process/route.js", "utf8"),
  readFile("app/api/operator/autonomous-watch/alert/route.js", "utf8"),
  readFile("components/operator/AutonomousWatchAlertBridge.jsx", "utf8"),
  readFile("app/(system)/workspace/[organizationId]/page.jsx", "utf8"),
  readFile("vercel.json", "utf8"),
]);

assert.match(runtimeSource, /scanOperatorAttention/);
assert.match(runtimeSource, /synthesizeOperatorBusinessThesis/);
assert.match(runtimeSource, /forceRefresh:\s*true/);
assert.match(runtimeSource, /mode:\s*"autonomous_read_only"/);
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
assert.match(runtimeSource, /resolveWatcherAccess/);
assert.match(runtimeSource, /staff_accounts/);
assert.match(runtimeSource, /organization_users/);
assert.match(runtimeSource, /party_id/);
assert.match(runtimeSource, /organization_id/);
assert.match(runtimeSource, /permissionSet/);
assert.match(runtimeSource, /FULL_ACCESS_ROLES/);
assert.match(runtimeSource, /project_state:\s*object\(projectState\)/);
assert.match(runtimeSource, /updated_at:\s*new Date\(\)\.toISOString\(\)/);
assert.doesNotMatch(runtimeSource, /updateIntelligenceConversationState/);
assert.doesNotMatch(runtimeSource, /last_message_at\s*:/);
assert.doesNotMatch(runtimeSource, /permissions:\s*\["\*"\]/);
assert.doesNotMatch(runtimeSource, /fullAccess:\s*true/);
assert.doesNotMatch(runtimeSource, /executeUbteCapability/);
assert.doesNotMatch(runtimeSource, /operator_mission/);
assert.doesNotMatch(runtimeSource, /pending_execution\s*:/);

assert.match(cronRouteSource, /CRON_SECRET/);
assert.match(cronRouteSource, /authorization/);
assert.match(cronRouteSource, /Bearer \$\{secret\}/);
assert.match(cronRouteSource, /runOperatorAutonomousWatchBatch/);
assert.match(cronRouteSource, /maxDuration = 300/);
assert.match(cronRouteSource, /Math\.min\([^]*\|\| 2, 4\)/);

assert.match(alertRouteSource, /requireOrganizationAccess/);
assert.match(alertRouteSource, /loadIntelligenceConversationSnapshot/);
assert.match(alertRouteSource, /conversationKey:\s*"primary"/);
assert.match(alertRouteSource, /pendingAlert/);
assert.match(alertRouteSource, /last_delivered_dedupe_key/);
assert.match(alertRouteSource, /status:\s*"delivered"/);
assert.match(alertRouteSource, /project_state:\s*nextProjectState/);
assert.match(alertRouteSource, /updated_at:\s*deliveredAt/);
assert.doesNotMatch(alertRouteSource, /updateIntelligenceConversationState/);
assert.doesNotMatch(alertRouteSource, /last_message_at\s*:/);
assert.doesNotMatch(alertRouteSource, /service_role/i);
assert.doesNotMatch(alertRouteSource, /executeUbteCapability/);

assert.match(bridgeSource, /POLL_INTERVAL_MS = 30_000/);
assert.match(bridgeSource, /\/api\/operator\/autonomous-watch\/alert/);
assert.match(bridgeSource, /avantiqo:speak/);
assert.match(bridgeSource, /synthetic-intelligence-autonomous-watch/);
assert.match(bridgeSource, /sessionStorage/);
assert.match(bridgeSource, /avantiqo:home-command/);
assert.match(bridgeSource, /Discuss/);
assert.match(bridgeSource, /Seen/);
assert.match(bridgeSource, /not authorization/i);

assert.match(workspaceSource, /AutonomousWatchAlertBridge/);
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
console.log("OPERATOR_AUTONOMOUS_WATCH_MODE=READ_ONLY");
console.log("OPERATOR_AUTONOMOUS_WATCH_SCOPE=CURRENT_STAFF_MEMBERSHIP_PERMISSIONS");
console.log("OPERATOR_AUTONOMOUS_WATCH_CADENCE=ADAPTIVE_WITH_BACKOFF");
console.log("OPERATOR_AUTONOMOUS_WATCH_ALERTS=DURABLE_DEDUPED_ACKNOWLEDGED");
console.log("OPERATOR_AUTONOMOUS_WATCH_ACTIVITY=SEPARATE_FROM_HUMAN_CONVERSATION");
console.log("OPERATOR_AUTONOMOUS_WATCH_EXECUTION=NO_BUSINESS_WRITE_AUTHORIZATION");
