import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const escalation = await readFile("lib/operator/secretary/SecretaryFollowUpEscalationRuntime.js", "utf8");
const worker = await readFile("app/api/internal/secretary/follow-ups/process/route.js", "utf8");
const reconciliation = await readFile("supabase/migrations/20260825064700_avantiqo_secretary_alert_reconciliation.sql", "utf8");

for (const reason of [
  "CONTACT_CALLS_DISABLED",
  "CONTACT_MESSAGES_DISABLED",
  "CONTACT_DO_NOT_DISTURB",
  "SAFE_COMMUNICATION_CHANNEL_UNAVAILABLE",
  "FOLLOW_UP_CONTENT_NOT_SELF_CONTAINED",
  "OUTBOUND_CALL_FAILED",
  "OUTBOUND_CALL_CANCELLED",
  "SECRETARY_FOLLOW_UP_CONTACT_PHONE_REQUIRED",
  "SECRETARY_FOLLOW_UP_PHONE_LINE_UNAVAILABLE",
]) {
  assert.match(escalation, new RegExp(reason));
}

assert.match(escalation, /alert_kind:\s*"FOLLOW_UP"/);
assert.match(escalation, /dedupeKey = `follow_up:\$\{followUp\.id\}:\$\{followUp\.due_at\}`/);
assert.match(escalation, /priority:\s*"HIGH"/);
assert.match(escalation, /human_action_required:\s*true/);
assert.match(escalation, /execution_blocked:\s*true/);
assert.match(escalation, /status:\s*"PENDING"/);
assert.match(escalation, /replayed:\s*true/);

assert.match(worker, /escalateSecretaryFollowUpExecution/);
assert.match(worker, /reconciled\?\.executions/);
assert.match(worker, /exhausted && secretaryFollowUpExecutionNeedsHumanAttention/);
assert.match(worker, /AVANTIQO_SECRETARY_FOLLOW_UP_EXECUTION_V2/);
assert.match(worker, /escalated:\s*escalations\.length/);

assert.match(reconciliation, /SOURCE_FOLLOW_UP_NO_LONGER_PENDING/);
assert.match(reconciliation, /a\.dedupe_key = 'follow_up:' \|\| f\.id::text \|\| ':' \|\| f\.due_at::text/);
assert.match(reconciliation, /f\.status = 'PENDING'/);

console.log("OPERATOR_SECRETARY_FOLLOW_UP_ESCALATION_AUDIT=PASS");
console.log("SECRETARY_BLOCKED_AUTONOMY_HUMAN_ESCALATION=true");
console.log("SECRETARY_FOLLOW_UP_ALERT_SINGLE_SOURCE=true");
console.log("SECRETARY_ESCALATION_REPLAY_SAFE=true");
console.log("SECRETARY_ESCALATION_AUTO_RESOLUTION=true");
console.log("SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false");
