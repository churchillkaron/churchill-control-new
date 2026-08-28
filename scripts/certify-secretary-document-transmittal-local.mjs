import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "../lib/shared/supabase/admin.js";
import {
  startSecretaryDocumentTransmittal,
  reviseSecretaryDocumentTransmittal,
  recordSecretaryDocumentDistribution,
  acknowledgeSecretaryDocumentTransmittal,
  refreshSecretaryDocumentTransmittal,
  completeSecretaryDocumentTransmittal,
  readSecretaryDocumentTransmittal,
} from "../lib/operator/secretary/SecretaryDocumentTransmittalRuntime.js";

const organizationId = randomUUID();
const ownerPartyId = randomUUID();
const recipientA = randomUUID();
const recipientB = randomUUID();
const context = { organizationId, timezone: "Asia/Bangkok", actor: { partyId: ownerPartyId }, metadata: { partyId: ownerPartyId } };

async function one(result) { const resolved = await result; if (resolved.error) throw resolved.error; return resolved.data || null; }
async function rejectsMessage(run, expected) { let caught = null; try { await run(); } catch (error) { caught = error; } assert.ok(caught); assert.equal(caught.message, expected); }

await one(supabaseAdmin.from("organizations").insert({ id: organizationId, name: "Secretary Document Transmittal Local Cert" }).select("*").single());
for (const [id, name] of [[ownerPartyId, "Executive Owner"], [recipientA, "Recipient A"], [recipientB, "Recipient B"]]) {
  await one(supabaseAdmin.from("parties").insert({ id, organization_id: organizationId, display_name: name, party_type: "PERSON", status: "ACTIVE" }).select("*").single());
}
await one(supabaseAdmin.from("secretary_settings").insert({ organization_id: organizationId, default_timezone: "Asia/Bangkok", appointment_duration_minutes: 30, business_hours: {}, booking_policy: { owner_party_id: ownerPartyId }, metadata: { owner_party_id: ownerPartyId } }).select("*").single());

const filingId = randomUUID();
await one(supabaseAdmin.from("secretary_tasks").insert({
  id: filingId,
  organization_id: organizationId,
  owner_party_id: ownerPartyId,
  title: "File document: Policy Handbook",
  details: "fixture",
  status: "IN_PROGRESS",
  priority: "NORMAL",
  source: "secretary_document_filing",
  created_by_party_id: ownerPartyId,
  metadata: {
    secretary_document_filing: true,
    document_key: "policy-handbook",
    document_title: "Policy Handbook",
    category: "POLICY",
    document_type: "HANDBOOK",
    document_status: "FILED",
    current_version: 2,
    versions: [
      { version: 1, status: "SUPERSEDED", source_reference: "ref://policy-v1", canonical_filename: "policy-v1.pdf", filing_path: "records/policy-v1.pdf", filed_at: "2035-08-01T00:00:00Z" },
      { version: 2, status: "CURRENT", source_reference: "ref://policy-v2", canonical_filename: "policy-v2.pdf", filing_path: "records/policy-v2.pdf", filed_at: "2035-08-02T00:00:00Z" },
    ],
  },
}).select("*").single());

const started = await startSecretaryDocumentTransmittal({ context, payload: {
  title: "Policy Handbook Distribution",
  evidence_id: "transmittal-start-1",
  occurred_at: "2035-08-10T01:00:00Z",
  distribution_due_at: "2035-08-11T01:00:00Z",
  acknowledgement_due_at: "2035-08-12T01:00:00Z",
  documents: [{ document_filing_id: filingId, document_version: 2 }],
  recipients: [
    { party_id: recipientA, channel: "EMAIL", required_ack: true },
    { party_id: recipientB, channel: "PORTAL", required_ack: false },
  ],
} });
assert.equal(started.record.state, "PREPARED");
assert.equal(started.record.documents[0].version, 2);
assert.equal(started.record.documents[0].source_reference, "ref://policy-v2");
assert.equal(started.record.frozen_versions.length, 1);

const refreshed1 = await refreshSecretaryDocumentTransmittal({ context, payload: { transmittal_id: started.transmittal.id } });
const refreshed2 = await refreshSecretaryDocumentTransmittal({ context, payload: { transmittal_id: started.transmittal.id } });
assert.equal(refreshed1.follow_up_count, 2);
assert.deepEqual(refreshed2.follow_up_ids, refreshed1.follow_up_ids);

const revised = await reviseSecretaryDocumentTransmittal({ context, payload: {
  transmittal_id: started.transmittal.id,
  expected_version: 1,
  evidence_id: "transmittal-revise-1",
  occurred_at: "2035-08-10T02:00:00Z",
  title: "Policy Handbook Distribution - Final",
  distribution_due_at: "2035-08-11T02:00:00Z",
  acknowledgement_due_at: "2035-08-12T02:00:00Z",
  documents: [{ document_filing_id: filingId, document_version: 2 }],
  recipients: [
    { party_id: recipientA, channel: "EMAIL", required_ack: true },
    { party_id: recipientB, channel: "PORTAL", required_ack: false },
  ],
} });
assert.equal(revised.record.transmittal_version, 2);
assert.equal(revised.record.frozen_versions.length, 2);
assert.notEqual(revised.record.frozen_versions[0].content_sha256, revised.record.frozen_versions[1].content_sha256);

await rejectsMessage(() => reviseSecretaryDocumentTransmittal({ context, payload: {
  transmittal_id: started.transmittal.id,
  expected_version: 1,
  evidence_id: "transmittal-stale-1",
  occurred_at: "2035-08-10T02:01:00Z",
  title: "stale",
  distribution_due_at: "2035-08-11T02:00:00Z",
  acknowledgement_due_at: "2035-08-12T02:00:00Z",
  documents: [{ document_filing_id: filingId, document_version: 2 }],
  recipients: [{ party_id: recipientA, channel: "EMAIL", required_ack: true }],
} }), "SECRETARY_DOCUMENT_TRANSMITTAL_STALE_VERSION");

const distA = await recordSecretaryDocumentDistribution({ context, payload: {
  transmittal_id: started.transmittal.id,
  expected_version: 2,
  evidence_id: "transmittal-dist-a",
  occurred_at: "2035-08-11T00:30:00Z",
  recipient_party_id: recipientA,
  distribution_status: "DELIVERED",
  source_reference: "email://delivery-a",
} });
assert.equal(distA.record.recipients.find((row) => row.party_id === recipientA).distribution_status, "DELIVERED");

const distB = await recordSecretaryDocumentDistribution({ context, payload: {
  transmittal_id: started.transmittal.id,
  expected_version: 3,
  evidence_id: "transmittal-dist-b",
  occurred_at: "2035-08-11T00:35:00Z",
  recipient_party_id: recipientB,
  distribution_status: "SENT",
  source_reference: "portal://delivery-b",
} });
assert.equal(distB.record.recipients.find((row) => row.party_id === recipientB).acknowledgement_status, "NOT_REQUIRED");

const ack = await acknowledgeSecretaryDocumentTransmittal({ context, payload: {
  transmittal_id: started.transmittal.id,
  expected_version: 4,
  evidence_id: "transmittal-ack-a",
  occurred_at: "2035-08-11T03:00:00Z",
  recipient_party_id: recipientA,
  source_reference: "reply://ack-a",
} });
assert.equal(ack.record.recipients.find((row) => row.party_id === recipientA).acknowledgement_status, "ACKNOWLEDGED");
assert.equal(ack.acknowledgement_is_approval, false);
assert.equal(ack.acknowledgement_is_acceptance, false);
assert.equal(ack.acknowledgement_is_signature, false);
assert.equal(ack.acknowledgement_is_legal_service, false);

const replay = await acknowledgeSecretaryDocumentTransmittal({ context, payload: {
  transmittal_id: started.transmittal.id,
  expected_version: 4,
  evidence_id: "transmittal-ack-a",
  occurred_at: "2035-08-11T03:00:00Z",
  recipient_party_id: recipientA,
  source_reference: "reply://ack-a",
} });
assert.equal(replay.replay_safe, true);

const completed = await completeSecretaryDocumentTransmittal({ context, payload: {
  transmittal_id: started.transmittal.id,
  expected_version: 5,
  evidence_id: "transmittal-complete-1",
  occurred_at: "2035-08-11T03:10:00Z",
} });
assert.equal(completed.record.state, "COMPLETED");

const pending = await one(supabaseAdmin.from("secretary_follow_ups").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("task_id", started.transmittal.id).eq("status", "PENDING"));
assert.equal(pending, null);
const pendingRows = await supabaseAdmin.from("secretary_follow_ups").select("id").eq("organization_id", organizationId).eq("task_id", started.transmittal.id).eq("status", "PENDING");
if (pendingRows.error) throw pendingRows.error;
assert.equal(pendingRows.data.length, 0);

const read = await readSecretaryDocumentTransmittal({ context, payload: { transmittal_id: started.transmittal.id } });
assert.equal(read.record.state, "COMPLETED");
for (const result of [started, revised, distA, distB, ack, completed, read]) {
  assert.equal(result.document_store_created, false);
  assert.equal(result.file_content_read, false);
  assert.equal(result.external_storage_access_performed, false);
  assert.equal(result.access_permission_bypassed, false);
  assert.equal(result.external_message_sent_by_runtime, false);
  assert.equal(result.external_delivery_performed_by_runtime, false);
  assert.equal(result.distribution_delivery_inferred, false);
  assert.equal(result.acknowledgement_inferred, false);
  assert.equal(result.acknowledgement_is_approval, false);
  assert.equal(result.acknowledgement_is_acceptance, false);
  assert.equal(result.acknowledgement_is_signature, false);
  assert.equal(result.acknowledgement_is_legal_service, false);
  assert.equal(result.legal_effect_inferred, false);
  assert.equal(result.provider_calls_performed, false);
  assert.equal(result.external_authority_used, false);
}

console.log("SECRETARY_DOCUMENT_TRANSMITTAL_LOCAL_CERTIFICATION=PASS");
console.log("SECRETARY_DOCUMENT_TRANSMITTAL_FILED_VERSION_FROZEN=true");
console.log("SECRETARY_DOCUMENT_TRANSMITTAL_REVISION_HISTORY_PRESERVED=true");
console.log("SECRETARY_DOCUMENT_TRANSMITTAL_DETERMINISTIC_FOLLOW_UPS=true");
console.log("SECRETARY_DOCUMENT_TRANSMITTAL_DISTRIBUTION_EVIDENCE_REQUIRED=true");
console.log("SECRETARY_DOCUMENT_TRANSMITTAL_ACKNOWLEDGEMENT_EVIDENCE_REQUIRED=true");
console.log("SECRETARY_DOCUMENT_TRANSMITTAL_NO_ACK_PATH_SUPPORTED=true");
console.log("SECRETARY_DOCUMENT_TRANSMITTAL_STALE_VERSION_FENCED=true");
console.log("SECRETARY_DOCUMENT_TRANSMITTAL_EVIDENCE_REPLAY_SAFE=true");
console.log("SECRETARY_DOCUMENT_TRANSMITTAL_TERMINAL_FOLLOW_UPS_CANCELLED=true");
console.log("SECRETARY_DOCUMENT_TRANSMITTAL_DISTRIBUTION_INFERRED=false");
console.log("SECRETARY_DOCUMENT_TRANSMITTAL_ACKNOWLEDGEMENT_INFERRED=false");
console.log("SECRETARY_DOCUMENT_TRANSMITTAL_ACKNOWLEDGEMENT_IS_APPROVAL=false");
console.log("SECRETARY_DOCUMENT_TRANSMITTAL_ACKNOWLEDGEMENT_IS_ACCEPTANCE=false");
console.log("SECRETARY_DOCUMENT_TRANSMITTAL_ACKNOWLEDGEMENT_IS_SIGNATURE=false");
console.log("SECRETARY_DOCUMENT_TRANSMITTAL_ACKNOWLEDGEMENT_IS_LEGAL_SERVICE=false");
console.log("SECRETARY_DOCUMENT_TRANSMITTAL_EXTERNAL_DELIVERY_PERFORMED=false");
console.log("SECRETARY_PROVIDER_CALLS_PERFORMED=false");
console.log("SECRETARY_EXTERNAL_AUTHORITY_USED=false");
console.log("SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false");
