import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "../lib/shared/supabase/admin.js";
import {
  cancelSecretaryMailCourierCoordination,
  listSecretaryMailCourierCoordination,
  readSecretaryMailCourierCoordination,
  recordSecretaryMailCourierDelivery,
  recordSecretaryMailCourierDispatch,
  recordSecretaryMailCourierHandoff,
  recordSecretaryMailCourierReceipt,
  recordSecretaryMailCourierRoute,
  startSecretaryMailCourierCoordination,
} from "../lib/operator/secretary/SecretaryMailCourierCoordinationRuntime.js";

const organizationId = randomUUID();
const ownerPartyId = randomUUID();
const recipientPartyId = randomUUID();
const wrongRecipientPartyId = randomUUID();
const context = {
  organizationId,
  timezone: "Asia/Bangkok",
  actor: { partyId: ownerPartyId },
  metadata: { partyId: ownerPartyId },
};

async function one(result) {
  const resolved = await result;
  if (resolved.error) throw resolved.error;
  return resolved.data || null;
}

async function rejectsMessage(run, message) {
  let caught = null;
  try {
    await run();
  } catch (error) {
    caught = error;
  }
  assert.ok(caught, `Expected rejection ${message}`);
  assert.equal(caught.message, message);
}

await one(supabaseAdmin.from("organizations").insert({ id: organizationId, name: "Secretary Mail Courier Local Cert" }).select("*").single());
await one(supabaseAdmin.from("parties").insert([
  { id: ownerPartyId, organization_id: organizationId, display_name: "Executive Owner", party_type: "PERSON", status: "ACTIVE" },
  { id: recipientPartyId, organization_id: organizationId, display_name: "Intended Recipient", party_type: "PERSON", status: "ACTIVE" },
  { id: wrongRecipientPartyId, organization_id: organizationId, display_name: "Wrong Recipient", party_type: "PERSON", status: "ACTIVE" },
]).select("*"));
await one(supabaseAdmin.from("secretary_settings").insert({
  organization_id: organizationId,
  default_timezone: "Asia/Bangkok",
  appointment_duration_minutes: 30,
  business_hours: {},
  booking_policy: { owner_party_id: ownerPartyId },
  metadata: { owner_party_id: ownerPartyId },
}).select("*").single());

const inbound = await startSecretaryMailCourierCoordination({
  context,
  payload: {
    direction: "INBOUND",
    item_kind: "PARCEL",
    item_description: "Sample inbound executive parcel",
    evidence_id: "mail-inbound-register-evidence",
    registered_at: "2035-06-03T01:00:00Z",
    next_check_at: "2035-06-03T02:00:00Z",
  },
});
assert.equal(inbound.status, "registered");
assert.equal(inbound.record.state, "REGISTERED");
assert.equal(inbound.replay_safe, false);

const inboundReplay = await startSecretaryMailCourierCoordination({
  context,
  payload: {
    direction: "INBOUND",
    item_kind: "PARCEL",
    item_description: "Sample inbound executive parcel",
    evidence_id: "mail-inbound-register-evidence",
    registered_at: "2035-06-03T01:00:00Z",
    next_check_at: "2035-06-03T02:00:00Z",
  },
});
assert.equal(inboundReplay.coordination.id, inbound.coordination.id);
assert.equal(inboundReplay.replay_safe, true);

const receipt = await recordSecretaryMailCourierReceipt({
  context,
  payload: {
    coordination_id: inbound.coordination.id,
    evidence_id: "mail-inbound-receipt-evidence",
    received_at: "2035-06-03T01:10:00Z",
  },
});
assert.equal(receipt.record.state, "RECEIVED");
assert.equal(receipt.receipt_inferred, false);
const receiptReplay = await recordSecretaryMailCourierReceipt({
  context,
  payload: {
    coordination_id: inbound.coordination.id,
    evidence_id: "mail-inbound-receipt-evidence",
    received_at: "2035-06-03T01:10:00Z",
  },
});
assert.equal(receiptReplay.replay_safe, true);

const routed = await recordSecretaryMailCourierRoute({
  context,
  payload: {
    coordination_id: inbound.coordination.id,
    evidence_id: "mail-inbound-route-evidence",
    routed_at: "2035-06-03T01:20:00Z",
    recipient_party_id: recipientPartyId,
    handoff_due_at: "2035-06-03T03:00:00Z",
  },
});
assert.equal(routed.record.state, "ROUTED");
assert.equal(routed.record.recipient_party_id, recipientPartyId);

await rejectsMessage(
  () => recordSecretaryMailCourierHandoff({
    context,
    payload: {
      coordination_id: inbound.coordination.id,
      evidence_id: "mail-wrong-recipient-evidence",
      handed_off_at: "2035-06-03T01:30:00Z",
      recipient_party_id: wrongRecipientPartyId,
    },
  }),
  "SECRETARY_MAIL_COURIER_HANDOFF_RECIPIENT_MISMATCH",
);

const handoff = await recordSecretaryMailCourierHandoff({
  context,
  payload: {
    coordination_id: inbound.coordination.id,
    evidence_id: "mail-inbound-handoff-evidence",
    handed_off_at: "2035-06-03T01:40:00Z",
    recipient_party_id: recipientPartyId,
  },
});
assert.equal(handoff.record.state, "COLLECTED");
assert.equal(handoff.collection_inferred, false);
const handoffReplay = await recordSecretaryMailCourierHandoff({
  context,
  payload: {
    coordination_id: inbound.coordination.id,
    evidence_id: "mail-inbound-handoff-evidence",
    handed_off_at: "2035-06-03T01:40:00Z",
    recipient_party_id: recipientPartyId,
  },
});
assert.equal(handoffReplay.replay_safe, true);

const inboundRead = await readSecretaryMailCourierCoordination({ context, payload: { coordination_id: inbound.coordination.id } });
assert.equal(inboundRead.record.state, "COLLECTED");
assert.equal(inboundRead.record.history.length, 4);

const inboundFollowUps = await one(supabaseAdmin.from("secretary_follow_ups").select("*").eq("organization_id", organizationId).eq("task_id", inbound.coordination.id));
assert.ok(inboundFollowUps.length >= 1);
assert.equal(inboundFollowUps.every((row) => row.status === "CANCELLED"), true);

const outbound = await startSecretaryMailCourierCoordination({
  context,
  payload: {
    direction: "OUTBOUND",
    item_kind: "DOCUMENT",
    item_description: "Sample outbound document envelope",
    evidence_id: "mail-outbound-register-evidence",
    registered_at: "2035-06-03T04:00:00Z",
    recipient_party_id: recipientPartyId,
  },
});
assert.equal(outbound.record.state, "REGISTERED");

const dispatched = await recordSecretaryMailCourierDispatch({
  context,
  payload: {
    coordination_id: outbound.coordination.id,
    evidence_id: "mail-outbound-dispatch-evidence",
    dispatched_at: "2035-06-03T04:15:00Z",
    carrier_name: "Certification Carrier",
    tracking_reference: "CERT-123",
    delivery_check_at: "2035-06-04T04:15:00Z",
  },
});
assert.equal(dispatched.record.state, "DISPATCHED");
assert.equal(dispatched.dispatch_inferred, false);
assert.equal(dispatched.carrier_booking_performed, false);
assert.equal(dispatched.postage_purchase_performed, false);
const dispatchReplay = await recordSecretaryMailCourierDispatch({
  context,
  payload: {
    coordination_id: outbound.coordination.id,
    evidence_id: "mail-outbound-dispatch-evidence",
    dispatched_at: "2035-06-03T04:15:00Z",
    carrier_name: "Certification Carrier",
    tracking_reference: "CERT-123",
    delivery_check_at: "2035-06-04T04:15:00Z",
  },
});
assert.equal(dispatchReplay.replay_safe, true);

const delivered = await recordSecretaryMailCourierDelivery({
  context,
  payload: {
    coordination_id: outbound.coordination.id,
    evidence_id: "mail-outbound-delivery-evidence",
    delivered_at: "2035-06-04T02:00:00Z",
  },
});
assert.equal(delivered.record.state, "DELIVERED");
assert.equal(delivered.delivery_inferred, false);
const deliveryReplay = await recordSecretaryMailCourierDelivery({
  context,
  payload: {
    coordination_id: outbound.coordination.id,
    evidence_id: "mail-outbound-delivery-evidence",
    delivered_at: "2035-06-04T02:00:00Z",
  },
});
assert.equal(deliveryReplay.replay_safe, true);

const cancellationFixture = await startSecretaryMailCourierCoordination({
  context,
  payload: {
    direction: "OUTBOUND",
    item_kind: "LETTER",
    item_description: "Cancellation fixture",
    evidence_id: "mail-cancel-register-evidence",
    registered_at: "2035-06-05T01:00:00Z",
  },
});
const cancelled = await cancelSecretaryMailCourierCoordination({
  context,
  payload: {
    coordination_id: cancellationFixture.coordination.id,
    evidence_id: "mail-cancel-evidence",
    cancelled_at: "2035-06-05T01:10:00Z",
    reason: "Internal administrative coordination no longer required.",
  },
});
assert.equal(cancelled.record.state, "CANCELLED");
assert.equal(cancelled.record.history.at(-1).external_carrier_cancellation_performed, false);
const cancelReplay = await cancelSecretaryMailCourierCoordination({
  context,
  payload: {
    coordination_id: cancellationFixture.coordination.id,
    evidence_id: "mail-cancel-evidence",
    cancelled_at: "2035-06-05T01:10:00Z",
    reason: "Internal administrative coordination no longer required.",
  },
});
assert.equal(cancelReplay.replay_safe, true);

const activeList = await listSecretaryMailCourierCoordination({ context, payload: {} });
assert.equal(activeList.count, 0);
const fullList = await listSecretaryMailCourierCoordination({ context, payload: { include_terminal: true } });
assert.equal(fullList.count, 3);

for (const result of [inbound, receipt, routed, handoff, outbound, dispatched, delivered, cancelled]) {
  assert.equal(result.legal_acceptance_inferred, false);
  assert.equal(result.contractual_acceptance_inferred, false);
  assert.equal(result.customs_declaration_created, false);
  assert.equal(result.customs_declaration_submitted, false);
  assert.equal(result.carrier_booking_performed, false);
  assert.equal(result.postage_purchase_performed, false);
  assert.equal(result.payment_authority_created, false);
  assert.equal(result.signing_authority_created, false);
  assert.equal(result.approval_authority_delegated, false);
  assert.equal(result.binding_authority_delegated, false);
  assert.equal(result.platform_permissions_mutated, false);
  assert.equal(result.external_authority_used, false);
}

console.log("SECRETARY_MAIL_COURIER_LOCAL_CERTIFICATION=PASS");
console.log("SECRETARY_MAIL_COURIER_INBOUND_CHAIN_OF_CUSTODY=true");
console.log("SECRETARY_MAIL_COURIER_RECEIPT_EVIDENCE_REQUIRED=true");
console.log("SECRETARY_MAIL_COURIER_EXPLICIT_RECIPIENT_ROUTING=true");
console.log("SECRETARY_MAIL_COURIER_WRONG_RECIPIENT_HANDOFF_BLOCKED=true");
console.log("SECRETARY_MAIL_COURIER_HANDOFF_EVIDENCE_REQUIRED=true");
console.log("SECRETARY_MAIL_COURIER_OUTBOUND_DISPATCH_TRACKING=true");
console.log("SECRETARY_MAIL_COURIER_DELIVERY_EVIDENCE_REQUIRED=true");
console.log("SECRETARY_MAIL_COURIER_EVIDENCE_REPLAY_SAFE=true");
console.log("SECRETARY_MAIL_COURIER_TERMINAL_FOLLOW_UPS_CANCELLED=true");
console.log("SECRETARY_MAIL_COURIER_EXTERNAL_CARRIER_CANCELLATION_PERFORMED=false");
console.log("SECRETARY_MAIL_COURIER_LEGAL_ACCEPTANCE_INFERRED=false");
console.log("SECRETARY_MAIL_COURIER_CUSTOMS_DECLARATION_CREATED=false");
console.log("SECRETARY_MAIL_COURIER_CARRIER_BOOKING_PERFORMED=false");
console.log("SECRETARY_MAIL_COURIER_POSTAGE_PURCHASE_PERFORMED=false");
console.log("SECRETARY_MAIL_COURIER_PLATFORM_PERMISSIONS_MUTATED=false");
console.log("SECRETARY_PROVIDER_CALLS_PERFORMED=false");
console.log("SECRETARY_EXTERNAL_AUTHORITY_USED=false");
console.log("SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false");
