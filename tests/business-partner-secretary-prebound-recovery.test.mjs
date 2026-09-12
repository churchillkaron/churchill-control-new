import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { secretaryPreboundMutationResult, secretaryRecoveryMutationResult } from "../lib/operator/secretary/SecretaryPreboundMutationRuntime.mjs";

const platform = fs.readFileSync("lib/platform/runtime/PlatformDomainRuntime.js", "utf8");
const runtimeFiles = [
  "SecretaryAppointmentAttendanceStewardshipRuntime.js",
  "SecretaryHospitalityCoordinationRuntime.js",
  "SecretaryDocumentPreparationRuntime.js",
  "SecretaryEventCoordinationRuntime.js",
  "SecretaryEventGuestCoordinationRuntime.js",
  "SecretaryExecutiveNotesDictationRuntime.js",
  "SecretaryMailCourierCoordinationRuntime.js",
  "SecretaryOfficeAdministrationRuntime.js",
  "SecretaryOfficeReproductionRuntime.js",
  "SecretaryRecordsRetrievalRuntime.js",
  "SecretarySignatureRoutingRuntime.js",
  "SecretaryStaffDelegationRuntime.js",
  "SecretaryDocumentTransmittalRuntime.js",
  "SecretaryMeetingPackCoordinationRuntime.js",
  "SecretaryOfficeArtifactPreparationRuntime.js",
  "SecretaryAccessMediaCustodyRuntime.js",
  "SecretaryPhysicalRecordsCustodyRuntime.js",
  "SecretaryWrittenActionAdministrationRuntime.js",
  "SecretaryExpensePackRuntime.js",
  "SecretaryAbsenceCoverageRuntime.js",
  "SecretaryDeadlineCoordinationRuntime.js",
  "SecretaryDocumentFilingRuntime.js",
].map((name) => fs.readFileSync(`lib/operator/secretary/${name}`, "utf8"));

test("twenty seven Secretary mutations use prebound exact recovery", () => {
  assert.equal((platform.match(/ambiguousWriteRecovery: "PREBOUND_EXACT_ID"/g) || []).length, 12);
  assert.match(platform, /function withPreboundSecretaryRecovery/);
});

test("prebound Secretary task inserts attach identity only on insert failure", () => {
  assert.equal(runtimeFiles.filter((src) => /secretaryPreboundMutationResult/.test(src)).length, 22);
});


test("authoritative Secretary recovery locators remain a closed three action set", () => {
  assert.equal((platform.match(/withSecretaryRecoveryLocator\(createSecretary/g) || []).length, 3);
  assert.match(platform, /secretary_meeting_agenda:[^\n]*withSecretaryRecoveryLocator/);
  assert.match(platform, /secretary_meeting_closeout:[^\n]*withSecretaryRecoveryLocator/);
  assert.match(platform, /secretary_visitor_coordination:[^\n]*withSecretaryRecoveryLocator/);
});


test("working preference recovery binds exact semantic history identity", () => {
  const source = fs.readFileSync("lib/operator/secretary/SecretaryWorkingPreferencesRuntime.js", "utf8");
  assert.match(source, /recoveryEntry = object\(produced\.output\?\.preference \|\| produced\.output\?\.history_entry\)/);
  assert.match(source, /\[\["entry_id", recoveryEntry\.entry_id\], \["domain", recoveryEntry\.domain\], \["key", recoveryEntry\.key\]\]/);
  for (const action of ["record", "correct", "retract"]) {
    assert.match(platform, new RegExp(`secretary_working_preferences:[^\n]*${action}:[^\n]*PREBOUND_EXACT_ID`));
  }
});

test("multi-key recovery evidence is attached only when the mutation result errors", async () => {
  const error = new Error("response lost");
  await assert.rejects(
    secretaryRecoveryMutationResult(Promise.resolve({ error }), [["calendar_event_id", "event-1"], ["visitor_party_id", "party-1"]]),
    (caught) => caught.action_identity_evidence?.includes("calendar_event_id:event-1") && caught.action_identity_evidence?.includes("visitor_party_id:party-1") && caught.mutation_completion_proven === false,
  );
  const success = await secretaryRecoveryMutationResult(Promise.resolve({ data: { id: "x" }, error: null }), [["meeting_id", "meeting-1"]]);
  assert.equal(success.data.id, "x");
});

test("prebound helper preserves fail-closed mutation semantics", async () => {
  const error = new Error("db ambiguous");
  await assert.rejects(
    secretaryPreboundMutationResult(Promise.resolve({ error }), "task_id", "abc-123"),
    (caught) => caught.action_identity_evidence?.includes("task_id:abc-123") && caught.mutation_completion_proven === false,
  );
  const success = await secretaryPreboundMutationResult(Promise.resolve({ data: { id: "abc-123" }, error: null }), "task_id", "abc-123");
  assert.equal(success.data.id, "abc-123");
});


test("job and outbound request creation prebind exact UUIDs before mutation", () => {
  const job = fs.readFileSync("lib/operator/secretary/SecretaryJobIntakeRuntime.js", "utf8");
  const call = fs.readFileSync("lib/operator/secretary/SecretaryOutboundCallRuntime.js", "utf8");
  assert.match(job, /const jobId = randomUUID\(\);[\s\S]*secretaryPreboundMutationResult\(supabaseAdmin[\s\S]*\.insert\(\{[\s\S]*id: jobId,[\s\S]*\.single\(\), "job_id", jobId\)/);
  assert.match(job, /job_id: job\.id/);
  assert.match(call, /const requestId = randomUUID\(\);[\s\S]*secretaryPreboundMutationResult\(supabaseAdmin[\s\S]*\.insert\(\{[\s\S]*id: requestId,[\s\S]*\.single\(\), "request_id", requestId\)/);
  assert.match(call, /request_id: request\.id/);
  assert.match(platform, /secretary_job: \{ delegate: async \(\) => withPreboundSecretaryRecovery\(createSecretaryJobCapability\("delegate"\), "platform\.secretary_job_record\.read", "job_id"\)/);
  assert.match(platform, /secretary_outbound_call: \{ place: async \(\) => withPreboundSecretaryRecovery\(createSecretaryOutboundCallCapability\("place"\), "platform\.secretary_outbound_call_request\.read", "request_id"\)/);
});

test("action identity cert locks twenty seven prebound Secretary mutations", () => {
  const cert = fs.readFileSync("scripts/certify-business-partner-action-identity-coverage-local.mjs", "utf8");
  assert.match(cert, /secretary_prebound_exact_recovery/);
  assert.match(cert, /secretary_remaining_fail_closed/);
  assert.match(cert, /secretaryPrebound\.length === 27/);
});
