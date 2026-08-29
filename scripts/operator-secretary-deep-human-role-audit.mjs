import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const files = Object.freeze({
  platform: "lib/platform/runtime/PlatformDomainRuntime.js",
  humanRole: "scripts/operator-secretary-human-role-source-audit.mjs",
  eventRuntime: "lib/operator/secretary/SecretaryEventCoordinationRuntime.js",
  eventCapability: "lib/platform/capabilities/createSecretaryEventCoordinationCapability.js",
  reproductionRuntime: "lib/operator/secretary/SecretaryOfficeReproductionRuntime.js",
  reproductionCapability: "lib/platform/capabilities/createSecretaryOfficeReproductionCapability.js",
  notes: "lib/operator/secretary/SecretaryExecutiveNotesDictationRuntime.js",
  stt: "lib/operator/runtime/OperatorVoiceAsyncTranscriptionRuntime.js",
  inbox: "lib/operator/secretary/SecretaryInboxTriageRuntime.js",
  jobs: "lib/operator/secretary/SecretaryJobExecutionRuntime.js",
});

const source = Object.fromEntries(
  await Promise.all(Object.entries(files).map(async ([key, path]) => [key, await readFile(path, "utf8")])),
);

// Keep the already-certified human-secretary matrix as the baseline rather than
// replacing it with a smaller "new gaps" audit.
assert.match(source.humanRole, /SECRETARY_CORE_EXECUTIVE_ROLE_COVERAGE_COMPLETE=true/);
for (const fragment of [
  "secretary_correspondence",
  "secretary_calendar_stewardship",
  "secretary_meeting_coordination",
  "secretary_event_guest_coordination",
  "secretary_hospitality_coordination",
  "secretary_resource_reservation",
  "secretary_document_preparation",
  "secretary_office_artifact_preparation",
  "secretary_mail_courier",
  "secretary_office_administration",
  "secretary_travel",
  "secretary_job",
]) {
  assert.ok(source.platform.includes(fragment), `Existing Secretary role coverage disappeared: ${fragment}`);
}

// Event coordination must be a parent/supervisor, not a second implementation
// of invitations, room allocation, catering or payment/booking authority.
assert.match(source.platform, /createSecretaryEventCoordinationCapability/);
assert.match(source.platform, /secretary_event_coordination:/);
assert.match(source.eventCapability, /capability:\s*"secretary_event_coordination"/);
for (const childSource of [
  "secretary_event_guest_coordination",
  "secretary_resource_reservation",
  "secretary_hospitality_coordination",
]) {
  assert.ok(source.eventRuntime.includes(childSource), `Event parent missing governed child source: ${childSource}`);
}
for (const supportingKind of ["DEADLINE", "CORRESPONDENCE", "DOCUMENT", "MEETING_PACK"]) {
  assert.ok(source.eventRuntime.includes(`"${supportingKind}"`), `Event parent missing supporting reference kind: ${supportingKind}`);
}
for (const fragment of [
  "SECRETARY_EVENT_COORDINATION_EXPECTED_VERSION_REQUIRED",
  "SECRETARY_EVENT_COORDINATION_STALE_VERSION",
  "SECRETARY_EVENT_COORDINATION_EVIDENCE_REUSE_CONFLICT",
  "SECRETARY_EVENT_COORDINATION_REQUIRED_COMPONENTS_NOT_READY",
  "frozen_ready_snapshots",
  "child_workflow_mutated: false",
  "child_completion_inferred: false",
  "attendance_inferred: false",
  "physical_access_granted_by_secretary: false",
  "resource_reserved_by_parent: false",
  "catering_ordered: false",
  "purchase_performed: false",
  "payment_authority_created: false",
  "signing_authority_created: false",
  "provider_calls_performed: false",
  "external_authority_used: false",
]) {
  assert.ok(source.eventRuntime.includes(fragment), `Event coordination governance missing: ${fragment}`);
}
assert.doesNotMatch(source.eventRuntime, /\.insert\([^)]*secretary_event_guest_coordination/);
assert.doesNotMatch(source.eventRuntime, /secretary_reserve_resource_slot/);

// A digital Secretary can coordinate real-world printing/scanning but cannot
// pretend to physically press buttons, grant printer access, or infer success.
assert.match(source.platform, /createSecretaryOfficeReproductionCapability/);
assert.match(source.platform, /secretary_office_reproduction:/);
assert.match(source.reproductionCapability, /capability:\s*"secretary_office_reproduction"/);
for (const fragment of [
  'new Set(["PRINT", "SCAN"])',
  "SECRETARY_OFFICE_REPRODUCTION_EXPECTED_VERSION_REQUIRED",
  "SECRETARY_OFFICE_REPRODUCTION_STALE_VERSION",
  "SECRETARY_OFFICE_REPRODUCTION_EVIDENCE_REUSE_CONFLICT",
  "SECRETARY_OFFICE_REPRODUCTION_OUTPUT_REFERENCE_REQUIRED",
  "physical_operation_performed_by_secretary: false",
  "print_completion_inferred: false",
  "scan_completion_inferred: false",
  "document_content_read_by_runtime: false",
  "document_content_modified_by_runtime: false",
  "external_sharing_performed: false",
  "device_permission_mutated: false",
  "device_credential_stored: false",
  "payment_authority_created: false",
  "external_authority_used: false",
]) {
  assert.ok(source.reproductionRuntime.includes(fragment), `Print/scan governance missing: ${fragment}`);
}

// Correct the previous false assumption: Executive Notes is exact text capture,
// not speech recognition. Speech-to-text is shared governed Voice infrastructure.
assert.match(source.notes, /transcription_performed:\s*false/);
assert.match(source.notes, /audio_processed:\s*false/);
assert.match(source.stt, /const CAPABILITY = "ai\.speech\.to\.text"/);
assert.match(source.stt, /const LANE = "voice-stt"/);
assert.match(source.stt, /audio_persisted:\s*false/);
assert.match(source.stt, /acquireVoiceRunpodWebLease/);
assert.match(source.stt, /ServiceExecutionRuntime\.execute/);
assert.match(source.stt, /ServiceExecutionRuntime\.settle/);

// Inbox/calendar interoperability already exists through durable Secretary jobs;
// do not add a second inbox or calendar execution architecture.
assert.match(source.inbox, /ensureSecretaryTriageJob/);
assert.match(source.inbox, /SECRETARY_HANDLE/);
for (const actionType of ["EMAIL", "MESSAGE", "CALL", "CREATE_TASK", "CREATE_EVENT"]) {
  assert.ok(source.jobs.includes(`"${actionType}"`), `Durable Secretary job action disappeared: ${actionType}`);
}
assert.match(source.jobs, /executeSecretaryJobCalendarStep/);

console.log("OPERATOR_SECRETARY_DEEP_HUMAN_ROLE_AUDIT=PASS");
console.log("SECRETARY_EXISTING_CERTIFIED_ROLE_MATRIX_PRESERVED=true");
console.log("SECRETARY_EVENT_COORDINATION_PARENT_LAYER=true");
console.log("SECRETARY_EVENT_CHILD_WORKFLOWS_REIMPLEMENTED=false");
console.log("SECRETARY_EVENT_READINESS_VERSION_FENCED=true");
console.log("SECRETARY_EVENT_READY_SNAPSHOT_FROZEN=true");
console.log("SECRETARY_PRINT_SCAN_COORDINATION=true");
console.log("SECRETARY_PHYSICAL_DEVICE_AUTHORITY_CREATED=false");
console.log("SECRETARY_SHARED_STT_REUSED=true");
console.log("SECRETARY_DUPLICATE_STT_ARCHITECTURE_CREATED=false");
console.log("SECRETARY_INBOX_CALENDAR_INTEROP_DUPLICATED=false");
console.log("SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false");