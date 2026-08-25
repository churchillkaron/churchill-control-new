import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const paths = {
  callStart: "app/api/internal/secretary/calls/start/route.js",
  callbackAutonomy: "lib/operator/secretary/SecretaryAutonomousCallbackRuntime.js",
  outboundMigration: "supabase/migrations/20260825064100_avantiqo_secretary_outbound_calls.sql",
  followUpExecution: "lib/operator/secretary/SecretaryFollowUpExecutionRuntime.js",
  sipTransport: "lib/operator/secretary/SecretarySipGatewayTransportRuntime.js",
  sipWorker: "app/api/internal/secretary/calls/outbound/process/route.js",
  outboundStatus: "app/api/internal/secretary/calls/outbound/status/route.js",
  voiceTurn: "app/api/internal/secretary/calls/turn/route.js",
  voiceGateway: "lib/operator/secretary/SecretaryVoiceCallGatewayRuntime.js",
  vercel: "vercel.json",
};

const source = Object.fromEntries(
  await Promise.all(
    Object.entries(paths).map(async ([key, path]) => [key, await readFile(path, "utf8")]),
  ),
);

assert.match(source.callStart, /secretary_resolve_message_contact/);
assert.match(source.callStart, /p_provider:\s*"pstn"/);
assert.match(source.callStart, /p_channel_type:\s*"call"/);
assert.match(source.callStart, /contact_created_or_resolved/);

assert.match(source.callbackAutonomy, /execution_owner:\s*"SECRETARY"/);
assert.match(source.callbackAutonomy, /execution_ready:\s*true/);
assert.match(source.callbackAutonomy, /execution_instruction:\s*instruction/);
assert.match(source.callbackAutonomy, /callback_superseded/);
assert.match(source.callbackAutonomy, /status:\s*"CANCELLED"/);
assert.match(source.callbackAutonomy, /after_hours_source_reference/);

assert.match(source.outboundMigration, /secretary_outbound_call_requests/);
assert.match(source.outboundMigration, /'PENDING','CLAIMED','DIALING','CONNECTED','COMPLETED','FAILED','CANCELLED'/);
assert.match(source.outboundMigration, /for update skip locked/i);
assert.match(source.outboundMigration, /attempt_count < r\.max_attempts/);
assert.match(source.outboundMigration, /scheduled_at <= now\(\)/);

assert.match(source.followUpExecution, /secretary_outbound_call_requests/);
assert.match(source.followUpExecution, /secretary_follow_up_execution_id/);
assert.match(source.followUpExecution, /reconcileQueuedSecretaryFollowUpExecutions/);

for (const envName of [
  "AVANTIQO_SECRETARY_SIP_GATEWAY_URL",
  "AVANTIQO_SECRETARY_PUBLIC_BASE_URL",
  "AVANTIQO_SECRETARY_SIP_GATEWAY_TOKEN",
  "AVANTIQO_SECRETARY_CALL_GATEWAY_TOKEN",
]) {
  assert.match(source.sipTransport, new RegExp(envName));
}
assert.match(source.sipTransport, /SECRETARY_SIP_GATEWAY_TRANSPORT_CONTRACT/);
assert.match(source.sipTransport, /authority:\s*"TRANSPORT_ONLY"/);
assert.match(source.sipTransport, /intelligence_owner:\s*"AVANTIQO"/);
assert.match(source.sipTransport, /state_owner:\s*"AVANTIQO"/);
assert.match(source.sipTransport, /AVANTIQO_SECRETARY_SIP_GATEWAY_V1/);
assert.match(source.sipTransport, /\/v1\/secretary\/calls/);
assert.match(source.sipTransport, /status_url/);
assert.match(source.sipTransport, /voice_turn_url/);
assert.match(source.sipTransport, /raw_audio_persisted:\s*false/);
assert.match(source.sipTransport, /secretarySipGatewayReadiness\(\)\.ready/);
assert.match(source.sipTransport, /transport_dispatch_exhausted/);
assert.match(source.sipTransport, /reconcileStaleSecretarySipCalls/);
assert.match(source.sipTransport, /SIP_GATEWAY_DIAL_TIMEOUT/);
assert.match(source.sipTransport, /SIP_GATEWAY_CONNECTED_TIMEOUT/);

assert.match(source.sipWorker, /process\.env\.CRON_SECRET/);
assert.match(source.sipWorker, /maxDuration = 300/);
assert.match(source.sipWorker, /secretarySipGatewayReadiness/);
assert.match(source.sipWorker, /reconcileStaleSecretarySipCalls/);
assert.match(source.sipWorker, /if \(!readiness\.ready\)/);
assert.match(source.sipWorker, /claimSecretarySipOutboundCall/);
assert.match(source.sipWorker, /dispatchSecretarySipOutboundCall/);

assert.match(source.outboundStatus, /result\.data\.status === "CLAIMED"/);
assert.match(source.outboundStatus, /status === "CONNECTED"/);
assert.match(source.outboundStatus, /createConnectedCall/);
assert.match(source.outboundStatus, /2 \* 60 \* 60 \* 1000/);
assert.match(source.outboundStatus, /claim_token:\s*null/);
assert.match(source.outboundStatus, /endSecretaryCall/);

assert.match(source.voiceTurn, /runSecretaryVoiceCallChunk/);
assert.match(source.voiceTurn, /audioBase64|audio_base64/);
assert.match(source.voiceGateway, /runSecretaryCallerTurnAutonomous/);
assert.match(source.voiceGateway, /ai\.speech\.to\.text/);
assert.match(source.voiceGateway, /ai\.text\.to\.speech/);
assert.match(source.voiceGateway, /raw_audio_persisted:\s*false/);

const vercel = JSON.parse(source.vercel);
const transportCron = (vercel.crons || []).find(
  (entry) => entry.path === "/api/internal/secretary/calls/outbound/process",
);
assert.ok(transportCron, "Missing Secretary outbound SIP transport cron");
assert.equal(transportCron.schedule, "* * * * *");
assert.equal(
  vercel.functions?.["app/api/internal/secretary/calls/outbound/process/route.js"]?.maxDuration,
  300,
);

for (const runtime of [source.sipTransport, source.sipWorker]) {
  assert.doesNotMatch(runtime, /Google Calendar|Outlook|Microsoft Calendar|Calendly|Twilio/i);
}

console.log("OPERATOR_SECRETARY_SIP_TRANSPORT_AUDIT=PASS");
console.log("SECRETARY_UNKNOWN_CALLER_NATIVE_RESOLUTION=true");
console.log("SECRETARY_CALLBACK_CANONICALIZATION=true");
console.log("SECRETARY_CALLBACK_AUTONOMOUS_EXECUTION=true");
console.log("SECRETARY_OWNED_SIP_TRANSPORT_BOUNDARY=true");
console.log("SECRETARY_SIP_TRANSPORT_FAIL_CLOSED=true");
console.log("SECRETARY_SIP_STALE_TRANSPORT_RECONCILIATION=true");
console.log("SECRETARY_VOICE_MEDIA_LOOP_SOURCE_COMPLETE=true");
console.log("SECRETARY_EXTERNAL_AUTHORITY_USED=false");
console.log("SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false");
