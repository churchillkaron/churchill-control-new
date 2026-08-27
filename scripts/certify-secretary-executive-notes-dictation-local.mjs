import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "../lib/shared/supabase/admin.js";
import {
  appendSecretaryExecutiveNote,
  cancelSecretaryExecutiveNote,
  captureSecretaryExecutiveNote,
  finalizeSecretaryExecutiveNote,
  listSecretaryExecutiveNotes,
  readSecretaryExecutiveNote,
  reviseSecretaryExecutiveNote,
} from "../lib/operator/secretary/SecretaryExecutiveNotesDictationRuntime.js";

const organizationId = randomUUID();
const ownerPartyId = randomUUID();
const context = { organizationId, timezone: "Asia/Bangkok", actor: { partyId: ownerPartyId }, metadata: { partyId: ownerPartyId } };

async function one(result) {
  const resolved = await result;
  if (resolved.error) throw resolved.error;
  return resolved.data || null;
}

async function rejectsMessage(run, expected) {
  let caught = null;
  try { await run(); } catch (error) { caught = error; }
  assert.ok(caught, `Expected rejection ${expected}`);
  assert.equal(caught.message, expected);
}

await one(supabaseAdmin.from("organizations").insert({ id: organizationId, name: "Secretary Executive Notes Local Cert" }).select("*").single());
await one(supabaseAdmin.from("parties").insert({ id: ownerPartyId, organization_id: organizationId, display_name: "Executive Owner", party_type: "PERSON", status: "ACTIVE" }).select("*").single());
await one(supabaseAdmin.from("secretary_settings").insert({ organization_id: organizationId, default_timezone: "Asia/Bangkok", appointment_duration_minutes: 30, business_hours: {}, booking_policy: { owner_party_id: ownerPartyId }, metadata: { owner_party_id: ownerPartyId } }).select("*").single());

const initial = "Call supplier Friday. Do not send anything yet.\n";
const captured = await captureSecretaryExecutiveNote({
  context,
  payload: { kind: "DICTATION", title: "Supplier thoughts", content: initial, evidence_id: "notes-capture-1", captured_at: "2035-07-01T01:00:00Z", speaker_party_id: ownerPartyId },
});
assert.equal(captured.record.state, "DRAFT");
assert.equal(captured.record.version, 1);
assert.equal(captured.record.exact_content, initial);
assert.equal(captured.exact_text_preserved, true);
assert.equal(captured.content_modified_by_secretary, false);

const replayCapture = await captureSecretaryExecutiveNote({
  context,
  payload: { kind: "DICTATION", title: "Supplier thoughts", content: initial, evidence_id: "notes-capture-1", captured_at: "2035-07-01T01:00:00Z", speaker_party_id: ownerPartyId },
});
assert.equal(replayCapture.note.id, captured.note.id);
assert.equal(replayCapture.replay_safe, true);

const segment = "Ask for updated delivery date.\n";
const appended = await appendSecretaryExecutiveNote({ context, payload: { note_id: captured.note.id, segment, evidence_id: "notes-append-1", appended_at: "2035-07-01T01:05:00Z", expected_version: 1 } });
assert.equal(appended.record.version, 2);
assert.equal(appended.record.exact_content, initial + segment);
assert.equal(appended.record.content_versions.length, 2);
const appendReplay = await appendSecretaryExecutiveNote({ context, payload: { note_id: captured.note.id, segment, evidence_id: "notes-append-1", appended_at: "2035-07-01T01:05:00Z", expected_version: 1 } });
assert.equal(appendReplay.replay_safe, true);

await rejectsMessage(
  () => appendSecretaryExecutiveNote({ context, payload: { note_id: captured.note.id, segment: "stale", evidence_id: "notes-stale", appended_at: "2035-07-01T01:06:00Z", expected_version: 1 } }),
  "SECRETARY_NOTES_STALE_VERSION",
);

const replacement = "Call supplier Friday. Ask for updated delivery date. Do not send anything yet.\n";
const revised = await reviseSecretaryExecutiveNote({ context, payload: { note_id: captured.note.id, replacement_content: replacement, evidence_id: "notes-revise-1", revised_at: "2035-07-01T01:10:00Z", expected_version: 2 } });
assert.equal(revised.record.version, 3);
assert.equal(revised.record.exact_content, replacement);
assert.equal(revised.record.content_versions.length, 3);
assert.equal(revised.record.content_versions[1].exact_content, initial + segment);

const finalized = await finalizeSecretaryExecutiveNote({ context, payload: { note_id: captured.note.id, evidence_id: "notes-finalize-1", finalized_at: "2035-07-01T01:20:00Z", expected_version: 3 } });
assert.equal(finalized.record.state, "FINAL");
assert.equal(finalized.record.version, 4);
assert.equal(finalized.directive_created, false);
assert.equal(finalized.decision_created, false);
assert.equal(finalized.commitment_created, false);
assert.equal(finalized.task_execution_created, false);
assert.equal(finalized.correspondence_sent, false);

const finalizeReplay = await finalizeSecretaryExecutiveNote({ context, payload: { note_id: captured.note.id, evidence_id: "notes-finalize-1", finalized_at: "2035-07-01T01:20:00Z", expected_version: 3 } });
assert.equal(finalizeReplay.replay_safe, true);

const reopened = await reviseSecretaryExecutiveNote({ context, payload: { note_id: captured.note.id, replacement_content: replacement + "Correction supplied explicitly.\n", evidence_id: "notes-revise-2", revised_at: "2035-07-01T01:30:00Z", expected_version: 4 } });
assert.equal(reopened.record.state, "DRAFT");
assert.equal(reopened.record.version, 5);
assert.equal(reopened.record.content_versions.length, 4);

const read = await readSecretaryExecutiveNote({ context, payload: { note_id: captured.note.id } });
assert.equal(read.record.version, 5);
assert.equal(read.record.history.length, 5);

const second = await captureSecretaryExecutiveNote({ context, payload: { kind: "MEMO", title: "Cancellation fixture", content: "Temporary memo", evidence_id: "notes-capture-2", captured_at: "2035-07-02T01:00:00Z" } });
const cancelled = await cancelSecretaryExecutiveNote({ context, payload: { note_id: second.note.id, evidence_id: "notes-cancel-1", cancelled_at: "2035-07-02T01:05:00Z", expected_version: 1, reason: "No longer needed" } });
assert.equal(cancelled.record.state, "CANCELLED");
const cancelReplay = await cancelSecretaryExecutiveNote({ context, payload: { note_id: second.note.id, evidence_id: "notes-cancel-1", cancelled_at: "2035-07-02T01:05:00Z", expected_version: 1, reason: "No longer needed" } });
assert.equal(cancelReplay.replay_safe, true);

const visible = await listSecretaryExecutiveNotes({ context, payload: {} });
assert.equal(visible.count, 1);
const all = await listSecretaryExecutiveNotes({ context, payload: { include_cancelled: true } });
assert.equal(all.count, 2);

for (const result of [captured, appended, revised, finalized, reopened, cancelled]) {
  assert.equal(result.transcription_performed, false);
  assert.equal(result.audio_processed, false);
  assert.equal(result.speaker_identity_inferred, false);
  assert.equal(result.meaning_inferred, false);
  assert.equal(result.instruction_inferred, false);
  assert.equal(result.directive_created, false);
  assert.equal(result.decision_created, false);
  assert.equal(result.commitment_created, false);
  assert.equal(result.task_execution_created, false);
  assert.equal(result.correspondence_sent, false);
  assert.equal(result.document_published, false);
  assert.equal(result.signature_applied, false);
  assert.equal(result.payment_authority_created, false);
  assert.equal(result.signing_authority_created, false);
  assert.equal(result.approval_authority_delegated, false);
  assert.equal(result.binding_authority_delegated, false);
  assert.equal(result.platform_permissions_mutated, false);
  assert.equal(result.provider_calls_performed, false);
  assert.equal(result.external_authority_used, false);
}

const taskRows = await one(supabaseAdmin.from("secretary_tasks").select("id,metadata").eq("organization_id", organizationId).eq("source", "secretary_executive_notes_dictation"));
assert.equal(taskRows.every((row) => row.metadata?.ledger_task_is_execution_work === false), true);

console.log("SECRETARY_EXECUTIVE_NOTES_DICTATION_LOCAL_CERTIFICATION=PASS");
console.log("SECRETARY_EXECUTIVE_NOTES_EXACT_TEXT_PRESERVED=true");
console.log("SECRETARY_EXECUTIVE_NOTES_APPEND_EXACT=true");
console.log("SECRETARY_EXECUTIVE_NOTES_VERSION_HISTORY_PRESERVED=true");
console.log("SECRETARY_EXECUTIVE_NOTES_REVISION_EXPLICIT=true");
console.log("SECRETARY_EXECUTIVE_NOTES_STALE_VERSION_FENCED=true");
console.log("SECRETARY_EXECUTIVE_NOTES_EVIDENCE_REPLAY_SAFE=true");
console.log("SECRETARY_EXECUTIVE_NOTES_LEDGER_TASK_IS_EXECUTION_WORK=false");
console.log("SECRETARY_EXECUTIVE_NOTES_TRANSCRIPTION_PERFORMED=false");
console.log("SECRETARY_EXECUTIVE_NOTES_DIRECTIVE_CREATED=false");
console.log("SECRETARY_EXECUTIVE_NOTES_DECISION_CREATED=false");
console.log("SECRETARY_EXECUTIVE_NOTES_COMMITMENT_CREATED=false");
console.log("SECRETARY_EXECUTIVE_NOTES_TASK_EXECUTION_CREATED=false");
console.log("SECRETARY_EXECUTIVE_NOTES_CORRESPONDENCE_SENT=false");
console.log("SECRETARY_EXECUTIVE_NOTES_PROVIDER_CALLS_PERFORMED=false");
console.log("SECRETARY_EXTERNAL_AUTHORITY_USED=false");
console.log("SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false");
