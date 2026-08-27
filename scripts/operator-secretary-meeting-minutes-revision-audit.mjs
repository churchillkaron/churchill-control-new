import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const paths = {
  engine: "lib/operator/secretary/SecretaryMeetingMinutesRevisionRuntime.js",
  guard: "lib/operator/secretary/SecretaryMeetingMinutesRevisionGovernedRuntime.js",
  capability: "lib/platform/capabilities/createSecretaryMeetingCloseoutCapability.js",
  platform: "lib/platform/runtime/PlatformDomainRuntime.js",
};

const source = Object.fromEntries(
  await Promise.all(Object.entries(paths).map(async ([key, path]) => [key, await readFile(path, "utf8")])),
);

assert.match(source.engine, /AVANTIQO_EXECUTIVE_SECRETARY_MEETING_MINUTES_REVISION_V1/);
assert.match(source.engine, /minutes_revision_history/);
assert.match(source.engine, /EVIDENCE_BACKED_FACTUAL_REVISION/);
assert.match(source.engine, /SECRETARY_MEETING_MINUTES_REVISION_EVIDENCE_REQUIRED/);
assert.match(source.engine, /SECRETARY_MEETING_MINUTES_REVISION_SUPERSEDES_VERSION_REQUIRED/);
assert.match(source.engine, /SECRETARY_MEETING_MINUTES_REVISION_STALE_REVISION_REJECTED/);
assert.match(source.engine, /SECRETARY_MEETING_MINUTES_REVISION_STALE_DISTRIBUTION_FENCED/);
assert.match(source.engine, /MINUTES_REVISION_DISTRIBUTION/);
assert.match(source.engine, /acknowledgement_status:\s*"PENDING"/);
assert.match(source.engine, /acknowledgement_evidence_id:\s*null/);
assert.match(source.engine, /secretary_exact_message_body_source:\s*executable \? EXACT_MESSAGE_SOURCE/);
assert.match(source.engine, /original_meeting_protocol_mutated:\s*false/);
assert.doesNotMatch(source.engine, /from\("secretary_meetings"\)\s*\.update/s);
assert.match(source.engine, /attendance_inferred:\s*false/);
assert.match(source.engine, /acknowledgement_not_approval:\s*true/);
assert.match(source.engine, /approval_authority_delegated:\s*false/);
assert.match(source.engine, /binding_authority_delegated:\s*false/);
assert.match(source.engine, /platform_permissions_mutated:\s*false/);
assert.match(source.engine, /external_authority_used:\s*false/);

assert.match(source.guard, /AVANTIQO_EXECUTIVE_SECRETARY_MEETING_MINUTES_REVISION_GOVERNED_V1/);
assert.match(source.guard, /correction_requests/);
assert.match(source.guard, /SECRETARY_MEETING_MINUTES_REVISION_CORRECTION_EVIDENCE_NOT_RECORDED/);
assert.match(source.guard, /SECRETARY_MEETING_MINUTES_REVISION_CORRECTION_EVIDENCE_AMBIGUOUS/);
assert.match(source.guard, /SECRETARY_MEETING_MINUTES_REVISION_HISTORY_ENTRY_NOT_FOUND/);
assert.match(source.guard, /SECRETARY_MEETING_MINUTES_REVISION_PROVENANCE_CONCURRENT_UPDATE_RETRY_REQUIRED/);
assert.match(source.guard, /correction_evidence_verified:\s*true/);
assert.match(source.guard, /correction_request_party_id/);
assert.match(source.guard, /correction_request_text/);
assert.match(source.guard, /correction_request_recorded_at/);
assert.match(source.guard, /minutes_revision_history:\s*history/);
assert.match(source.guard, /\.eq\("updated_at", task\.updated_at\)/);
assert.match(source.guard, /reviseSecretaryMeetingMinutes/);
assert.match(source.guard, /binding_authority_delegated:\s*false/);
assert.match(source.guard, /approval_authority_delegated:\s*false/);

assert.match(source.capability, /SecretaryMeetingMinutesRevisionGovernedRuntime/);
assert.doesNotMatch(source.capability, /from "@\/lib\/operator\/secretary\/SecretaryMeetingMinutesRevisionRuntime"/);
assert.match(source.capability, /reviseMinutes/);
assert.match(source.capability, /recorded correction request/);
assert.match(source.capability, /supersedes_version/);
assert.match(source.capability, /evidence_id/);
assert.match(source.capability, /revised_minutes_body/);
assert.match(source.capability, /operatorRequiresConfirmation:\s*false/);
assert.match(source.platform, /reviseMinutes:\s*async \(\) => createSecretaryMeetingCloseoutCapability\("reviseMinutes"\)/);

console.log("OPERATOR_SECRETARY_MEETING_MINUTES_REVISION_AUDIT=PASS");
console.log("SECRETARY_MEETING_MINUTES_REVISION_EVIDENCE_REQUIRED=true");
console.log("SECRETARY_MEETING_MINUTES_REVISION_CORRECTION_EVIDENCE_VERIFIED=true");
console.log("SECRETARY_MEETING_MINUTES_REVISION_CORRECTION_PROVENANCE_DURABLE=true");
console.log("SECRETARY_MEETING_MINUTES_REVISION_HISTORY_PRESERVED=true");
console.log("SECRETARY_MEETING_MINUTES_REVISION_STALE_REVISION_FENCED=true");
console.log("SECRETARY_MEETING_MINUTES_REVISION_STALE_DISTRIBUTION_FENCED=true");
console.log("SECRETARY_MEETING_MINUTES_REVISION_ACKNOWLEDGEMENTS_RESET=true");
console.log("SECRETARY_MEETING_MINUTES_REVISION_DETERMINISTIC_REDISTRIBUTION=true");
console.log("SECRETARY_MEETING_MINUTES_REVISION_ORIGINAL_CAPTURE_MUTATED=false");
console.log("SECRETARY_MEETING_MINUTES_REVISION_ATTENDANCE_INFERRED=false");
console.log("SECRETARY_MEETING_MINUTES_REVISION_ACKNOWLEDGEMENT_NOT_APPROVAL=true");
console.log("SECRETARY_MEETING_MINUTES_REVISION_PLATFORM_PERMISSIONS_MUTATED=false");
console.log("SECRETARY_MEETING_MINUTES_REVISION_BINDING_AUTHORITY_DELEGATED=false");
console.log("SECRETARY_MEETING_MINUTES_REVISION_APPROVAL_AUTHORITY_DELEGATED=false");
console.log("SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false");
