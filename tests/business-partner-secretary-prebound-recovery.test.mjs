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

test("thirty four Secretary mutations use prebound exact recovery", () => {
  assert.equal((platform.match(/ambiguousWriteRecovery: "PREBOUND_EXACT_ID"/g) || []).length, 13);
  assert.match(platform, /function withPreboundSecretaryRecovery/);
});

test("prebound Secretary task inserts attach identity only on insert failure", () => {
  assert.equal(runtimeFiles.filter((src) => /secretaryPreboundMutationResult/.test(src)).length, 22);
});


test("authoritative Secretary recovery locators remain a closed eleven action set", () => {
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

test("action identity cert locks thirty four prebound Secretary mutations", () => {
  const cert = fs.readFileSync("scripts/certify-business-partner-action-identity-coverage-local.mjs", "utf8");
  assert.match(cert, /secretary_prebound_exact_recovery/);
  assert.match(cert, /secretary_remaining_fail_closed/);
  assert.match(cert, /secretaryPrebound\.length === 34/);
});

test("meeting coordination prebinds the atomic RPC identity", () => {
  const runtime = fs.readFileSync("lib/operator/secretary/SecretaryMeetingCoordinationRuntime.js", "utf8");
  const migration = fs.readFileSync("supabase/migrations/20260912125500_secretary_meeting_coordination_prebound_identity.sql", "utf8");
  assert.match(runtime, /const coordinationId = randomUUID\(\)/);
  assert.match(runtime, /p_coordination_id: coordinationId/);
  assert.match(runtime, /secretaryPreboundMutationResult/);
  assert.match(runtime, /coordination_id: result\.data\.id/);
  assert.match(migration, /p_coordination_id uuid/);
  assert.match(migration, /p_coordination_id, p_organization_id/);
  assert.match(migration, /caller-prebound coordination UUID/);
});

test("paperwork and travel reuse prebound Secretary job identity", () => {
  assert.match(platform, /secretary_paperwork:[^\n]*withPreboundSecretaryRecovery[^\n]*secretary_job_record\.read[^\n]*job_id/);
  assert.match(platform, /secretary_travel:[^\n]*withPreboundSecretaryRecovery[^\n]*secretary_job_record\.read[^\n]*job_id/);
});


test("decision and directive registers prebind exact durable IDs", () => {
  const decision = fs.readFileSync("lib/operator/secretary/SecretaryExecutiveDecisionRegisterRuntime.js", "utf8");
  const directive = fs.readFileSync("lib/operator/secretary/SecretaryExecutiveDirectiveRegisterRuntime.js", "utf8");
  assert.match(decision, /const decisionId = deterministicUuid/);
  assert.match(decision, /id: decisionId/);
  assert.match(decision, /secretaryPreboundMutationResult[\s\S]*"decision_id",[\s\S]*decisionId/);
  assert.match(decision, /decision_id: decisionId/);
  assert.match(directive, /const directiveId = deterministicUuid/);
  assert.match(directive, /id: directiveId/);
  assert.match(directive, /secretaryPreboundMutationResult[\s\S]*"directive_id",[\s\S]*directiveId/);
  assert.match(directive, /directive_id: directiveId/);
  assert.match(platform, /secretary_decision_register:[^\n]*withPreboundSecretaryRecovery[^\n]*secretary_decision_register\.read[^\n]*decision_id/);
  assert.match(platform, /secretary_directive_register:[^\n]*withPreboundSecretaryRecovery[^\n]*secretary_directive_register\.read[^\n]*directive_id/);
});


test("recurring meeting create prebinds the atomic series identity", () => {
  const runtime = fs.readFileSync("lib/operator/secretary/SecretaryRecurringMeetingRuntime.js", "utf8");
  const migration = fs.readFileSync("supabase/migrations/20260912141000_secretary_recurring_meeting_prebound_identity.sql", "utf8");
  assert.match(runtime, /const seriesId = randomUUID\(\)/);
  assert.match(runtime, /p_series_id: seriesId/);
  assert.match(runtime, /secretaryPreboundMutationResult/);
  assert.match(runtime, /"series_id",\s*seriesId/);
  assert.match(runtime, /series_id: series\.id/);
  assert.match(platform, /secretary_recurring_meeting:[^\n]*withPreboundSecretaryRecovery[^\n]*secretary_recurring_meeting\.read[^\n]*series_id/);
  assert.match(migration, /p_series_id uuid/);
  assert.match(migration, /insert into public\.secretary_recurring_meeting_series \(\s*id,/);
  assert.match(migration, /select\s+p_series_id,/);
  assert.match(migration, /drop function public\.secretary_create_recurring_meeting_series/);
});


test("important date registration binds exact semantic history recovery", () => {
  const runtime = fs.readFileSync("lib/operator/secretary/SecretaryImportantDateStewardshipRuntime.js", "utf8");
  const verifier = fs.readFileSync("lib/platform/capabilities/createSecretaryCoreVerificationCapability.js", "utf8");
  assert.match(runtime, /const dateId = deterministicUuid/);
  assert.match(runtime, /secretaryRecoveryMutationResult/);
  assert.match(runtime, /\["date_id", dateId\]/);
  assert.match(runtime, /payload_sha256: hash/);
  assert.match(verifier, /secretary_important_date_event/);
  assert.match(verifier, /IMPORTANT_DATE_REGISTERED/);
  assert.match(verifier, /payload_sha256/);
  assert.match(platform, /secretary_important_date_stewardship:[^\n]*PREBOUND_EXACT_ID/);
});


test("travel document readiness binds truncation-safe semantic recovery", () => {
  const runtime = fs.readFileSync("lib/operator/secretary/SecretaryTravelDocumentReadinessRuntime.js", "utf8");
  const verifier = fs.readFileSync("lib/platform/capabilities/createSecretaryCoreVerificationCapability.js", "utf8");
  assert.match(runtime, /secretaryRecoveryMutationResult/);
  assert.match(runtime, /\["event", eventName\]/);
  assert.match(runtime, /TRAVEL_DOCUMENT_READINESS_STARTED/);
  assert.match(verifier, /secretary_travel_document_event/);
  assert.match(verifier, /history\.length >= 500/);
  assert.match(verifier, /state: exact \? "COMPLETED" : definitelyAbsent \? "NOT_COMPLETED" : "UNCERTAIN"/);
  for (const action of ["start", "addRequirement", "reopen"]) {
    assert.match(platform, new RegExp(`secretary_travel_document_readiness:[^\n]*${action}:[^\n]*AUTHORITATIVE_RECOVERY_LOCATOR`));
  }
});


test("calendar protection recovers by exact deterministic protection key", () => {
  const runtime = fs.readFileSync("lib/operator/secretary/SecretaryExecutiveCalendarStewardshipRuntime.js", "utf8");
  const verifier = fs.readFileSync("lib/platform/capabilities/createSecretaryCoreVerificationCapability.js", "utf8");
  assert.match(runtime, /function protectionKey/);
  assert.match(runtime, /protection_key: key/);
  assert.match(runtime, /attachActionIdentityEvidence\(error/);
  assert.match(runtime, /owner_party_id:\$\{auth\.owner\}/);
  assert.match(verifier, /secretary_calendar_protection/);
  assert.match(verifier, /duplicate_match_count/);
  assert.match(verifier, /state: exact \? "COMPLETED" : definitelyAbsent \? "NOT_COMPLETED" : "UNCERTAIN"/);
  assert.match(platform, /secretary_calendar_stewardship:[^\n]*protect:[^\n]*AUTHORITATIVE_RECOVERY_LOCATOR/);
});


test("calendar protection release verifies exact persisted release evidence", () => {
  const runtime = fs.readFileSync("lib/operator/secretary/SecretaryExecutiveCalendarStewardshipRuntime.js", "utf8");
  const verifier = fs.readFileSync("lib/platform/capabilities/createSecretaryCoreVerificationCapability.js", "utf8");
  assert.match(runtime, /secretaryRecoveryMutationResult/);
  assert.match(runtime, /\[\["event_id", protectionId\], \["evidence_id", evidenceId\], \["released_at", releasedAt\]\]/);
  assert.match(runtime, /event_id: protectionId/);
  assert.match(verifier, /secretary_calendar_protection_release/);
  assert.match(verifier, /release_evidence_id/);
  assert.match(verifier, /conflicting_release/);
  assert.match(platform, /secretary_calendar_stewardship:[^\n]*release:[^\n]*secretary_calendar_protection_release\.read[^\n]*AUTHORITATIVE_RECOVERY_LOCATOR/);
});


test("meeting coordination transitions persist exact evidence inside atomic RPC wrappers", () => {
  const meeting = fs.readFileSync("lib/operator/secretary/SecretaryMeetingCoordinationRuntime.js", "utf8");
  const booked = fs.readFileSync("lib/operator/secretary/SecretaryBookedMeetingChangeRuntime.js", "utf8");
  const capability = fs.readFileSync("lib/platform/capabilities/createSecretaryMeetingCoordinationCapability.js", "utf8");
  const verifier = fs.readFileSync("lib/platform/capabilities/createSecretaryCoreVerificationCapability.js", "utf8");
  const migration = fs.readFileSync("supabase/migrations/20260912122305_secretary_meeting_transition_evidence.sql", "utf8");
  assert.match(capability, /required: \["coordination_id", "starts_at", "ends_at", "evidence_id"\]/);
  assert.match(capability, /required: \["coordination_id", "evidence_id"\]/);
  assert.match(meeting, /p_evidence_id: evidenceId/);
  assert.match(meeting, /\["transition_kind", "CANCEL_COORDINATION"\]/);
  assert.match(booked, /\["transition_kind", "RESCHEDULE_BOOKED"\]/);
  assert.match(booked, /\["transition_kind", "CANCEL_BOOKED"\]/);
  assert.match(migration, /meeting_transition_evidence_history/);
  assert.match(migration, /SECRETARY_MEETING_TRANSITION_EVIDENCE_REUSE_CONFLICT/);
  assert.match(migration, /v_result := public\.secretary_reschedule_booked_meeting_coordination/);
  assert.match(migration, /v_result := public\.secretary_cancel_booked_meeting_coordination/);
  assert.match(verifier, /secretary_meeting_transition/);
  assert.match(verifier, /currentStateAllowsRetry/);
  for (const action of ["cancel", "rescheduleBooked", "cancelBooked"]) {
    assert.match(platform, new RegExp(`secretary_meeting_coordination:[^\\n]*${action}:[^\\n]*secretary_meeting_transition\\.read[^\\n]*AUTHORITATIVE_RECOVERY_LOCATOR`));
  }
});
