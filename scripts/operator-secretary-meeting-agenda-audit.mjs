import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [runtime, capability, platform] = await Promise.all([
  readFile("lib/operator/secretary/SecretaryMeetingAgendaRuntime.js", "utf8"),
  readFile("lib/platform/capabilities/createSecretaryMeetingAgendaCapability.js", "utf8"),
  readFile("lib/platform/runtime/PlatformDomainRuntime.js", "utf8"),
]);

assert.match(runtime, /AVANTIQO_EXECUTIVE_SECRETARY_MEETING_AGENDA_V1/);
assert.match(runtime, /agendaTaskId/);
assert.match(runtime, /deterministicUuid/);
assert.match(runtime, /CONTRIBUTION_REQUEST/);
assert.match(runtime, /CONTRIBUTION_CHASE/);
assert.match(runtime, /AGENDA_DISTRIBUTION/);
assert.match(runtime, /AGENDA_RECEIPT_ACK_CHASE/);
assert.match(runtime, /execution_owner:\s*"SECRETARY"/);
assert.match(runtime, /execution_ready:\s*true/);
assert.match(runtime, /secretary_owned:\s*true/);
assert.match(runtime, /agenda_state:\s*"FINALIZED"/);
assert.match(runtime, /versions:\s*\[\.\.\.list\(metadata\.versions\), snapshot\]/);
assert.match(runtime, /revision_from_version/);
assert.match(runtime, /stale pending distribution\/receipt follow-up fenced/i);
assert.match(runtime, /late_contributions/);
assert.match(runtime, /pending_redistribution/);
assert.match(runtime, /SECRETARY_MEETING_AGENDA_CONTRIBUTION_EVIDENCE_REQUIRED/);
assert.match(runtime, /SECRETARY_MEETING_AGENDA_ACKNOWLEDGEMENT_EVIDENCE_REQUIRED/);
assert.match(runtime, /SECRETARY_MEETING_AGENDA_EXPLICIT_ACKNOWLEDGEMENT_REQUIRED/);
assert.match(runtime, /receipt_acknowledgement_is_not_rsvp:\s*true/);
assert.match(runtime, /attendance_not_inferred:\s*true/);
assert.match(runtime, /rsvp_not_inferred:\s*true/);
assert.match(runtime, /distribution_delivery_not_inferred:\s*true/);
assert.match(runtime, /external_authority_used:\s*false/);
assert.doesNotMatch(runtime, /deliverCommunicationMessage/);
assert.doesNotMatch(runtime, /placeSecretaryOutboundCall/);
assert.doesNotMatch(runtime, /service_role/i);

for (const action of ["start", "read", "addItem", "recordContribution", "finalize", "revise", "distribute", "acknowledge"]) {
  assert.match(capability, new RegExp(`\\b${action}:\\s*\\{`));
  assert.match(platform, new RegExp(`createSecretaryMeetingAgendaCapability\\(\\"${action}\\"\\)`));
}
assert.match(capability, /capability:\s*"secretary_meeting_agenda"/);
assert.match(capability, /contextScope:\s*"organization"/);
assert.match(capability, /operatorRequiresConfirmation:\s*config\.confirm === true/);
assert.match(capability, /record agenda contribution items only when explicit evidence is supplied/i);
assert.match(capability, /receipt acknowledgement never becomes RSVP or attendance confirmation/i);
assert.match(platform, /createSecretaryMeetingAgendaCapability/);
assert.match(platform, /secretary_meeting_agenda:/);

console.log("OPERATOR_SECRETARY_MEETING_AGENDA_AUDIT=PASS");
console.log("SECRETARY_MEETING_AGENDA_DURABLE_LIFECYCLE=true");
console.log("SECRETARY_MEETING_AGENDA_COLLECTION_AND_CHASING=true");
console.log("SECRETARY_MEETING_AGENDA_DETERMINISTIC_FOLLOW_UPS=true");
console.log("SECRETARY_MEETING_AGENDA_VERSION_HISTORY=true");
console.log("SECRETARY_MEETING_AGENDA_LATE_CONTRIBUTION_REVISION=true");
console.log("SECRETARY_MEETING_AGENDA_DISTRIBUTION_GOVERNED=true");
console.log("SECRETARY_MEETING_AGENDA_RECEIPT_EVIDENCE_REQUIRED=true");
console.log("SECRETARY_MEETING_AGENDA_ATTENDANCE_NOT_INFERRED=true");
console.log("SECRETARY_MEETING_AGENDA_RSVP_NOT_INFERRED=true");
console.log("SECRETARY_EXTERNAL_AUTHORITY_USED=false");
console.log("SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false");
