import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "../lib/shared/supabase/admin.js";
import {
  acknowledgeSecretaryPhysicalRecordTransfer,
  checkoutSecretaryPhysicalRecordCustody,
  initiateSecretaryPhysicalRecordTransfer,
  markSecretaryPhysicalRecordMissing,
  readSecretaryPhysicalRecordCustody,
  recoverSecretaryPhysicalRecord,
  refreshSecretaryPhysicalRecordCustody,
  registerSecretaryPhysicalRecordCustody,
  returnSecretaryPhysicalRecordToStorage,
} from "../lib/operator/secretary/SecretaryPhysicalRecordsCustodyRuntime.js";

const organizationId = randomUUID();
const ownerPartyId = randomUUID();
const holderPartyId = randomUUID();
const secondHolderPartyId = randomUUID();
const context = { organizationId, timezone: "Asia/Bangkok", actor: { partyId: ownerPartyId }, metadata: { partyId: ownerPartyId } };

async function one(result) { const resolved = await result; if (resolved.error) throw resolved.error; return resolved.data || null; }
async function rejectsMessage(run, expected) { let caught = null; try { await run(); } catch (error) { caught = error; } assert.ok(caught); assert.equal(caught.message, expected); }

await one(supabaseAdmin.from("organizations").insert({ id: organizationId, name: "Secretary Physical Records Custody Local Cert" }).select("*").single());
for (const [id, name] of [[ownerPartyId, "Executive Owner"], [holderPartyId, "Records Holder A"], [secondHolderPartyId, "Records Holder B"]]) {
  await one(supabaseAdmin.from("parties").insert({ id, organization_id: organizationId, display_name: name, party_type: "PERSON", status: "ACTIVE" }).select("*").single());
  await one(supabaseAdmin.from("secretary_contact_profiles").insert({ organization_id: organizationId, party_id: id, preferred_channel: "message", allow_calls: true, allow_messages: true, do_not_disturb: {} }).select("*").single());
}
await one(supabaseAdmin.from("secretary_settings").insert({ organization_id: organizationId, default_timezone: "Asia/Bangkok", appointment_duration_minutes: 30, business_hours: {}, booking_policy: { owner_party_id: ownerPartyId }, metadata: { owner_party_id: ownerPartyId } }).select("*").single());

const registered = await registerSecretaryPhysicalRecordCustody({ context, payload: {
  label: "Board resolutions archive box 2026",
  record_kind: "BOX",
  record_reference: "BOX-BOARD-2026-01",
  storage_location: "Records Room A / Shelf 4 / Bay 2",
  evidence_id: "physical-register-1",
  occurred_at: "2035-08-01T01:00:00Z",
} });
assert.equal(registered.record.state, "STORED");
assert.equal(registered.record.current_storage_location, "Records Room A / Shelf 4 / Bay 2");
assert.equal(registered.record.version, 1);

const checkout = await checkoutSecretaryPhysicalRecordCustody({ context, payload: {
  custody_id: registered.custody.id,
  holder_party_id: holderPartyId,
  expected_return_at: "2035-08-03T10:00:00Z",
  evidence_id: "physical-checkout-1",
  occurred_at: "2035-08-01T02:00:00Z",
  expected_version: 1,
} });
assert.equal(checkout.record.state, "CHECKED_OUT");
assert.equal(checkout.record.current_holder_party_id, holderPartyId);
assert.equal(checkout.record.version, 2);

const refreshOne = await refreshSecretaryPhysicalRecordCustody({ context, payload: { custody_id: registered.custody.id } });
const refreshTwo = await refreshSecretaryPhysicalRecordCustody({ context, payload: { custody_id: registered.custody.id } });
assert.equal(refreshOne.follow_up_count, 1);
assert.deepEqual(refreshOne.follow_up_ids, refreshTwo.follow_up_ids);

await rejectsMessage(() => returnSecretaryPhysicalRecordToStorage({ context, payload: {
  custody_id: registered.custody.id,
  storage_location: "Records Room A / Shelf 4 / Bay 2",
  evidence_id: "physical-stale-return-1",
  occurred_at: "2035-08-01T03:00:00Z",
  expected_version: 1,
} }), "SECRETARY_PHYSICAL_RECORDS_STALE_VERSION");

const transfer = await initiateSecretaryPhysicalRecordTransfer({ context, payload: {
  custody_id: registered.custody.id,
  target_party_id: secondHolderPartyId,
  acknowledgement_due_at: "2035-08-01T05:00:00Z",
  evidence_id: "physical-transfer-1",
  occurred_at: "2035-08-01T04:00:00Z",
  expected_version: 2,
} });
assert.equal(transfer.record.state, "IN_TRANSFER");
assert.equal(transfer.record.current_holder_party_id, holderPartyId);
assert.equal(transfer.record.pending_transfer.target_party_id, secondHolderPartyId);
assert.equal(transfer.record.version, 3);

const transferRefreshOne = await refreshSecretaryPhysicalRecordCustody({ context, payload: { custody_id: registered.custody.id } });
const transferRefreshTwo = await refreshSecretaryPhysicalRecordCustody({ context, payload: { custody_id: registered.custody.id } });
assert.equal(transferRefreshOne.follow_up_count, 1);
assert.deepEqual(transferRefreshOne.follow_up_ids, transferRefreshTwo.follow_up_ids);

const acknowledged = await acknowledgeSecretaryPhysicalRecordTransfer({ context, payload: {
  custody_id: registered.custody.id,
  source_reference: "message://holder-b-ack-1",
  evidence_id: "physical-transfer-ack-1",
  occurred_at: "2035-08-01T04:30:00Z",
  expected_version: 3,
} });
assert.equal(acknowledged.record.state, "CHECKED_OUT");
assert.equal(acknowledged.record.current_holder_party_id, secondHolderPartyId);
assert.equal(acknowledged.record.pending_transfer, null);
assert.equal(acknowledged.record.version, 4);

const ackReplay = await acknowledgeSecretaryPhysicalRecordTransfer({ context, payload: {
  custody_id: registered.custody.id,
  source_reference: "message://holder-b-ack-1",
  evidence_id: "physical-transfer-ack-1",
  occurred_at: "2035-08-01T04:30:00Z",
  expected_version: 3,
} });
assert.equal(ackReplay.replay_safe, true);

const returned = await returnSecretaryPhysicalRecordToStorage({ context, payload: {
  custody_id: registered.custody.id,
  storage_location: "Records Room A / Shelf 4 / Bay 2",
  evidence_id: "physical-return-1",
  occurred_at: "2035-08-02T01:00:00Z",
  expected_version: 4,
} });
assert.equal(returned.record.state, "STORED");
assert.equal(returned.record.current_holder_party_id, null);
assert.equal(returned.record.current_storage_location, "Records Room A / Shelf 4 / Bay 2");
assert.equal(returned.record.custody_history.length, 3);
assert.equal(returned.record.version, 5);

const missingRecord = await registerSecretaryPhysicalRecordCustody({ context, payload: {
  label: "Original lease folder",
  record_kind: "FOLDER",
  storage_location: "Records Room B / Cabinet 7",
  evidence_id: "physical-register-missing-1",
  occurred_at: "2035-08-03T01:00:00Z",
} });
const missing = await markSecretaryPhysicalRecordMissing({ context, payload: {
  custody_id: missingRecord.custody.id,
  source_reference: "inventory-check://records-room-b-2035-08-03",
  evidence_id: "physical-missing-1",
  occurred_at: "2035-08-03T02:00:00Z",
  expected_version: 1,
} });
assert.equal(missing.record.state, "MISSING");
assert.equal(missing.record.missing_status_inferred, false);

const recovered = await recoverSecretaryPhysicalRecord({ context, payload: {
  custody_id: missingRecord.custody.id,
  storage_location: "Records Room B / Cabinet 7 / Folder Slot 3",
  source_reference: "inventory-check://recovered-2035-08-03",
  evidence_id: "physical-recovery-1",
  occurred_at: "2035-08-03T03:00:00Z",
  expected_version: 2,
} });
assert.equal(recovered.record.state, "STORED");
assert.equal(recovered.record.current_storage_location, "Records Room B / Cabinet 7 / Folder Slot 3");
assert.equal(recovered.record.missing_history.length, 2);

const read = await readSecretaryPhysicalRecordCustody({ context, payload: { custody_id: registered.custody.id } });
assert.equal(read.record.state, "STORED");
assert.equal(read.record.custody_inferred, false);
assert.equal(read.missing_inferred_from_overdue, false);

const pendingRows = await one(supabaseAdmin.from("secretary_follow_ups").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("task_id", registered.custody.id).eq("status", "PENDING"));
void pendingRows;
const followUps = await supabaseAdmin.from("secretary_follow_ups").select("id,status,metadata").eq("organization_id", organizationId).eq("task_id", registered.custody.id);
if (followUps.error) throw followUps.error;
assert.equal((followUps.data || []).filter((row) => row.status === "PENDING").length, 0);

for (const result of [registered, checkout, refreshOne, transfer, transferRefreshOne, acknowledged, returned, missing, recovered, read]) {
  assert.equal(result.physical_record_content_read, false);
  assert.equal(result.external_storage_access_performed, false);
  assert.equal(result.access_permission_bypassed, false);
  assert.equal(result.physical_access_granted, false);
  assert.equal(result.custody_inferred, false);
  assert.equal(result.missing_status_inferred, false);
  assert.equal(result.destruction_authorized, false);
  assert.equal(result.record_destroyed, false);
  assert.equal(result.retention_decision_made, false);
  assert.equal(result.archive_deletion_performed, false);
  assert.equal(result.legal_hold_changed, false);
  assert.equal(result.payment_authority_created, false);
  assert.equal(result.signing_authority_created, false);
  assert.equal(result.binding_authority_delegated, false);
  assert.equal(result.provider_calls_performed, false);
  assert.equal(result.external_authority_used, false);
}

console.log("SECRETARY_PHYSICAL_RECORDS_CUSTODY_LOCAL_CERTIFICATION=PASS");
console.log("SECRETARY_PHYSICAL_RECORDS_STORAGE_LOCATION_EXPLICIT=true");
console.log("SECRETARY_PHYSICAL_RECORDS_CHECKOUT_EVIDENCE=true");
console.log("SECRETARY_PHYSICAL_RECORDS_DETERMINISTIC_FOLLOW_UPS=true");
console.log("SECRETARY_PHYSICAL_RECORDS_TRANSFER_ACK_REQUIRED=true");
console.log("SECRETARY_PHYSICAL_RECORDS_TRANSFER_HISTORY_PRESERVED=true");
console.log("SECRETARY_PHYSICAL_RECORDS_RETURN_EVIDENCE=true");
console.log("SECRETARY_PHYSICAL_RECORDS_MISSING_EXCEPTION_EXPLICIT=true");
console.log("SECRETARY_PHYSICAL_RECORDS_RECOVERY_EVIDENCE=true");
console.log("SECRETARY_PHYSICAL_RECORDS_EVIDENCE_REPLAY_SAFE=true");
console.log("SECRETARY_PHYSICAL_RECORDS_STALE_VERSION_FENCED=true");
console.log("SECRETARY_PHYSICAL_RECORDS_TERMINAL_FOLLOW_UPS_CANCELLED=true");
console.log("SECRETARY_PHYSICAL_RECORDS_CUSTODY_INFERRED=false");
console.log("SECRETARY_PHYSICAL_RECORDS_MISSING_STATUS_INFERRED=false");
console.log("SECRETARY_PHYSICAL_RECORDS_CONTENT_READ=false");
console.log("SECRETARY_PHYSICAL_RECORDS_ACCESS_PERMISSION_BYPASSED=false");
console.log("SECRETARY_PHYSICAL_RECORDS_PHYSICAL_ACCESS_GRANTED=false");
console.log("SECRETARY_PHYSICAL_RECORDS_DESTRUCTION_AUTHORIZED=false");
console.log("SECRETARY_PHYSICAL_RECORDS_RECORD_DESTROYED=false");
console.log("SECRETARY_PHYSICAL_RECORDS_RETENTION_DECISION_MADE=false");
console.log("SECRETARY_PHYSICAL_RECORDS_ARCHIVE_DELETION_PERFORMED=false");
console.log("SECRETARY_PHYSICAL_RECORDS_LEGAL_HOLD_CHANGED=false");
console.log("SECRETARY_PHYSICAL_RECORDS_PAYMENT_AUTHORITY_CREATED=false");
console.log("SECRETARY_PHYSICAL_RECORDS_SIGNING_AUTHORITY_CREATED=false");
console.log("SECRETARY_PHYSICAL_RECORDS_BINDING_AUTHORITY_DELEGATED=false");
console.log("SECRETARY_PROVIDER_CALLS_PERFORMED=false");
console.log("SECRETARY_EXTERNAL_AUTHORITY_USED=false");
console.log("SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false");
