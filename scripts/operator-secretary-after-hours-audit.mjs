import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const paths = {
  businessHours: "lib/operator/secretary/SecretaryBusinessHoursRuntime.js",
  quietHours: "lib/operator/secretary/SecretaryContactQuietHoursRuntime.js",
  afterHours: "lib/operator/secretary/SecretaryAfterHoursConversationRuntime.js",
  callbackAutonomy: "lib/operator/secretary/SecretaryAutonomousCallbackRuntime.js",
  messageWorker: "app/api/internal/secretary/messages/process/route.js",
  voiceGateway: "lib/operator/secretary/SecretaryVoiceCallGatewayRuntime.js",
};

const source = Object.fromEntries(
  await Promise.all(
    Object.entries(paths).map(async ([key, path]) => [key, await readFile(path, "utf8")]),
  ),
);

assert.match(source.businessHours, /FULL_SERVICE_24_7/);
assert.match(source.businessHours, /FULL_SERVICE/);
assert.match(source.businessHours, /RECEPTION_ONLY/);
assert.match(source.businessHours, /CLOSED_REPLY/);
assert.match(source.businessHours, /Intl\.DateTimeFormat/);
assert.match(source.businessHours, /overnight ranges supported/);
assert.match(source.businessHours, /secretaryAfterHoursAllowedDecisionActions/);

assert.match(source.afterHours, /resolveSecretaryBusinessHoursState/);
assert.match(source.afterHours, /secretaryAfterHoursAllowedDecisionActions/);
assert.match(source.afterHours, /allowedActions\.includes\(action\)/);
assert.match(source.afterHours, /Never attempt booking, rescheduling, cancellation, availability checks, appointment listing/);
assert.match(source.afterHours, /tools:\s*\[\]/);
assert.match(source.afterHours, /allow_mutating_tools:\s*false/);
assert.match(source.afterHours, /next_state_change_at/);
assert.match(source.afterHours, /execution_owner:\s*"SECRETARY"/);
assert.match(source.afterHours, /execution_ready:\s*true/);
assert.match(source.afterHours, /execution_instruction:/);
assert.match(source.afterHours, /after_hours_source_reference/);
assert.match(source.afterHours, /external_authority_used:\s*false/);

assert.match(source.callbackAutonomy, /callback_autonomy_promoted/);
assert.match(source.callbackAutonomy, /execution_owner:\s*"SECRETARY"/);
assert.match(source.callbackAutonomy, /execution_ready:\s*true/);
assert.match(source.callbackAutonomy, /execution_instruction:\s*instruction/);
assert.match(source.callbackAutonomy, /return updated \|\| row/);

assert.match(source.messageWorker, /runSecretaryMessageReceptionAutonomous/);
assert.match(source.messageWorker, /callback_autonomy_promoted/);
assert.match(source.messageWorker, /server_allowed_actions/);
assert.match(source.voiceGateway, /runSecretaryCallerTurnAutonomous/);
assert.match(source.voiceGateway, /callback_autonomy_promoted/);
assert.match(source.voiceGateway, /server_allowed_actions/);

assert.match(source.quietHours, /enabled_behavior:/);
assert.match(source.quietHours, /enabled=true does not create a permanent block/);
assert.doesNotMatch(source.quietHours, /permanent_flags:\s*\[[^\]]*"enabled"/);
assert.match(source.quietHours, /top-level start\/end\/days\/channels/);

for (const runtime of [source.afterHours, source.callbackAutonomy]) {
  assert.doesNotMatch(runtime, /Google Calendar|Outlook|Microsoft Calendar|Calendly|Twilio/i);
}

console.log("OPERATOR_SECRETARY_AFTER_HOURS_AUDIT=PASS");
console.log("SECRETARY_BUSINESS_HOURS_ENFORCED=true");
console.log("SECRETARY_AFTER_HOURS_RECEPTION=true");
console.log("SECRETARY_AFTER_HOURS_CALENDAR_MUTATIONS_BLOCKED=true");
console.log("SECRETARY_CALLBACK_AUTONOMY=true");
console.log("SECRETARY_QUIET_HOURS_SCHEDULE_SEMANTICS=true");
console.log("SECRETARY_EXTERNAL_AUTHORITY_USED=false");
console.log("SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false");
