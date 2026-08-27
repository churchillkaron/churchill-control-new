import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "../lib/shared/supabase/admin.js";
import {
  cancelSecretaryDocumentPreparation,
  finalizeSecretaryDocumentPreparation,
  listSecretaryDocumentPreparations,
  prepareSecretaryDocument,
  readSecretaryDocumentPreparation,
  reviseSecretaryDocumentPreparation,
} from "../lib/operator/secretary/SecretaryDocumentPreparationRuntime.js";

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

await one(supabaseAdmin.from("organizations").insert({ id: organizationId, name: "Secretary Document Preparation Local Cert" }).select("*").single());
await one(supabaseAdmin.from("parties").insert({ id: ownerPartyId, organization_id: organizationId, display_name: "Executive Owner", party_type: "PERSON", status: "ACTIVE" }).select("*").single());
await one(supabaseAdmin.from("secretary_settings").insert({ organization_id: organizationId, default_timezone: "Asia/Bangkok", appointment_duration_minutes: 30, business_hours: {}, booking_policy: { owner_party_id: ownerPartyId }, metadata: { owner_party_id: ownerPartyId } }).select("*").single());

const source = "Dear team,\nThe meeting is Friday at 10. Please bring the signed draft.\nRegards,\nPatric\n";
const preparedV1 = "Dear Team,\n\nThe meeting is Friday at 10. Please bring the signed draft.\n\nRegards,\nPatric\n";
const prepared = await prepareSecretaryDocument({
  context,
  payload: {
    kind: "LETTER",
    title: "Friday meeting note",
    source_text: source,
    prepared_text: preparedV1,
    change_scope: "PROOFREAD_AND_FORMAT",
    change_summary: "Capitalization and spacing only; no factual changes.",
    instruction: "Proofread and format only. Preserve all facts, dates, names and instructions.",
    evidence_id: "doc-prep-1",
    prepared_at: "2035-08-01T01:00:00Z",
  },
});
assert.equal(prepared.record.state, "DRAFT");
assert.equal(prepared.record.version, 1);
assert.equal(prepared.record.exact_source_text, source);
assert.equal(prepared.record.exact_prepared_text, preparedV1);
assert.equal(prepared.record.prepared_versions.length, 1);
assert.equal(prepared.source_text_preserved, true);
assert.equal(prepared.prepared_text_stored_exactly, true);

const replay = await prepareSecretaryDocument({
  context,
  payload: {
    kind: "LETTER",
    title: "Friday meeting note",
    source_text: source,
    prepared_text: preparedV1,
    change_scope: "PROOFREAD_AND_FORMAT",
    change_summary: "Capitalization and spacing only; no factual changes.",
    instruction: "Proofread and format only. Preserve all facts, dates, names and instructions.",
    evidence_id: "doc-prep-1",
    prepared_at: "2035-08-01T01:00:00Z",
  },
});
assert.equal(replay.replay_safe, true);
assert.equal(replay.preparation.id, prepared.preparation.id);

const preparedV2 = "Dear Team,\n\nThe meeting is Friday at 10. Please bring the signed draft.\n\nBest regards,\nPatric\n";
const revised = await reviseSecretaryDocumentPreparation({
  context,
  payload: {
    preparation_id: prepared.preparation.id,
    prepared_text: preparedV2,
    change_scope: "POLISH_PRESERVE_MEANING",
    change_summary: "Polished closing only.",
    instruction: "Polish wording without changing factual content or instructions.",
    evidence_id: "doc-prep-revise-1",
    revised_at: "2035-08-01T01:10:00Z",
    expected_version: 1,
  },
});
assert.equal(revised.record.version, 2);
assert.equal(revised.record.state, "DRAFT");
assert.equal(revised.record.exact_source_text, source);
assert.equal(revised.record.exact_prepared_text, preparedV2);
assert.equal(revised.record.prepared_versions.length, 2);
assert.equal(revised.record.prepared_versions[0].exact_prepared_text, preparedV1);

const reviseReplay = await reviseSecretaryDocumentPreparation({
  context,
  payload: {
    preparation_id: prepared.preparation.id,
    prepared_text: preparedV2,
    change_scope: "POLISH_PRESERVE_MEANING",
    change_summary: "Polished closing only.",
    instruction: "Polish wording without changing factual content or instructions.",
    evidence_id: "doc-prep-revise-1",
    revised_at: "2035-08-01T01:10:00Z",
    expected_version: 1,
  },
});
assert.equal(reviseReplay.replay_safe, true);

await rejectsMessage(
  () => reviseSecretaryDocumentPreparation({
    context,
    payload: {
      preparation_id: prepared.preparation.id,
      prepared_text: "stale",
      change_scope: "PROOFREAD_ONLY",
      evidence_id: "doc-prep-stale",
      revised_at: "2035-08-01T01:11:00Z",
      expected_version: 1,
    },
  }),
  "SECRETARY_DOCUMENT_PREPARATION_STALE_VERSION",
);

const finalized = await finalizeSecretaryDocumentPreparation({
  context,
  payload: { preparation_id: prepared.preparation.id, evidence_id: "doc-prep-final-1", finalized_at: "2035-08-01T01:20:00Z", expected_version: 2 },
});
assert.equal(finalized.record.state, "FINAL");
assert.equal(finalized.record.version, 3);
assert.equal(finalized.correspondence_sent, false);
assert.equal(finalized.document_published, false);
assert.equal(finalized.document_filed, false);
assert.equal(finalized.signature_applied, false);
assert.equal(finalized.binding_submission_performed, false);
assert.equal(finalized.semantic_equivalence_verified, false);
assert.equal(finalized.factual_accuracy_verified, false);
assert.equal(finalized.legal_accuracy_verified, false);

const reopenedText = "Dear Team,\n\nThe meeting is Friday at 10. Please bring the signed draft.\n\nKind regards,\nPatric\n";
const reopened = await reviseSecretaryDocumentPreparation({
  context,
  payload: {
    preparation_id: prepared.preparation.id,
    prepared_text: reopenedText,
    change_scope: "POLISH_PRESERVE_MEANING",
    change_summary: "Explicitly corrected closing after finalization.",
    instruction: "Replace the final internal copy with this explicitly supplied corrected version.",
    evidence_id: "doc-prep-revise-2",
    revised_at: "2035-08-01T01:30:00Z",
    expected_version: 3,
  },
});
assert.equal(reopened.record.state, "DRAFT");
assert.equal(reopened.record.version, 4);
assert.equal(reopened.record.exact_source_text, source);
assert.equal(reopened.record.prepared_versions.length, 3);

const read = await readSecretaryDocumentPreparation({ context, payload: { preparation_id: prepared.preparation.id } });
assert.equal(read.record.version, 4);
assert.equal(read.record.history.length, 4);
assert.equal(read.record.exact_source_text, source);

const second = await prepareSecretaryDocument({
  context,
  payload: {
    kind: "MEMO",
    title: "Cancellation fixture",
    source_text: "Raw memo text",
    prepared_text: "Prepared memo text",
    change_scope: "PROOFREAD_ONLY",
    evidence_id: "doc-prep-2",
    prepared_at: "2035-08-02T01:00:00Z",
  },
});
const cancelled = await cancelSecretaryDocumentPreparation({
  context,
  payload: {
    preparation_id: second.preparation.id,
    evidence_id: "doc-prep-cancel-1",
    cancelled_at: "2035-08-02T01:10:00Z",
    reason: "No longer needed",
    expected_version: 1,
  },
});
assert.equal(cancelled.record.state, "CANCELLED");

const visible = await listSecretaryDocumentPreparations({ context, payload: {} });
assert.equal(visible.count, 1);
const all = await listSecretaryDocumentPreparations({ context, payload: { include_cancelled: true } });
assert.equal(all.count, 2);

for (const result of [prepared, revised, finalized, reopened, cancelled]) {
  assert.equal(result.source_text_preserved, true);
  assert.equal(result.prepared_text_stored_exactly, true);
  assert.equal(result.source_meaning_changed_by_runtime, false);
  assert.equal(result.semantic_equivalence_verified, false);
  assert.equal(result.factual_accuracy_verified, false);
  assert.equal(result.legal_accuracy_verified, false);
  assert.equal(result.business_approval_inferred, false);
  assert.equal(result.correspondence_sent, false);
  assert.equal(result.document_published, false);
  assert.equal(result.document_filed, false);
  assert.equal(result.signature_applied, false);
  assert.equal(result.binding_submission_performed, false);
  assert.equal(result.payment_authority_created, false);
  assert.equal(result.signing_authority_created, false);
  assert.equal(result.approval_authority_delegated, false);
  assert.equal(result.binding_authority_delegated, false);
  assert.equal(result.platform_permissions_mutated, false);
  assert.equal(result.provider_calls_performed, false);
  assert.equal(result.external_authority_used, false);
}

const taskRows = await one(supabaseAdmin.from("secretary_tasks").select("id,metadata").eq("organization_id", organizationId).eq("source", "secretary_document_preparation"));
assert.equal(taskRows.every((row) => row.metadata?.ledger_task_is_execution_work === false), true);

console.log("SECRETARY_DOCUMENT_PREPARATION_LOCAL_CERTIFICATION=PASS");
console.log("SECRETARY_DOCUMENT_PREPARATION_SOURCE_TEXT_PRESERVED=true");
console.log("SECRETARY_DOCUMENT_PREPARATION_PREPARED_TEXT_STORED_EXACTLY=true");
console.log("SECRETARY_DOCUMENT_PREPARATION_VERSION_HISTORY_PRESERVED=true");
console.log("SECRETARY_DOCUMENT_PREPARATION_STALE_VERSION_FENCED=true");
console.log("SECRETARY_DOCUMENT_PREPARATION_EVIDENCE_REPLAY_SAFE=true");
console.log("SECRETARY_DOCUMENT_PREPARATION_FINAL_INTERNAL_COPY_ONLY=true");
console.log("SECRETARY_DOCUMENT_PREPARATION_SEMANTIC_EQUIVALENCE_VERIFIED=false");
console.log("SECRETARY_DOCUMENT_PREPARATION_FACTUAL_ACCURACY_VERIFIED=false");
console.log("SECRETARY_DOCUMENT_PREPARATION_LEGAL_ACCURACY_VERIFIED=false");
console.log("SECRETARY_DOCUMENT_PREPARATION_CORRESPONDENCE_SENT=false");
console.log("SECRETARY_DOCUMENT_PREPARATION_DOCUMENT_PUBLISHED=false");
console.log("SECRETARY_DOCUMENT_PREPARATION_DOCUMENT_FILED=false");
console.log("SECRETARY_DOCUMENT_PREPARATION_SIGNATURE_APPLIED=false");
console.log("SECRETARY_DOCUMENT_PREPARATION_BINDING_SUBMISSION_PERFORMED=false");
console.log("SECRETARY_DOCUMENT_PREPARATION_PROVIDER_CALLS_PERFORMED=false");
console.log("SECRETARY_EXTERNAL_AUTHORITY_USED=false");
console.log("SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false");
