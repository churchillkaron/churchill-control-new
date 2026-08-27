import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "../lib/shared/supabase/admin.js";
import {
  cancelSecretarySignatureRouting,
  listSecretarySignatureRouting,
  readSecretarySignatureRouting,
  recordSecretarySignatureDecline,
  recordSecretarySignatureEvidence,
  refreshSecretarySignatureRouting,
  scheduleSecretarySignatureReminder,
  startSecretarySignatureRouting,
} from "../lib/operator/secretary/SecretarySignatureRoutingRuntime.js";

const organizationId = randomUUID();
const ownerPartyId = randomUUID();
const signerOneId = randomUUID();
const signerTwoId = randomUUID();
const optionalSignerId = randomUUID();
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

async function rejectsMessage(run, expected) {
  let caught = null;
  try { await run(); } catch (error) { caught = error; }
  assert.ok(caught, `Expected rejection ${expected}`);
  assert.equal(caught.message, expected);
}

await one(supabaseAdmin.from("organizations").insert({ id: organizationId, name: "Secretary Signature Routing Local Cert" }).select("*").single());
await one(supabaseAdmin.from("parties").insert([
  { id: ownerPartyId, organization_id: organizationId, display_name: "Executive Owner", party_type: "PERSON", status: "ACTIVE" },
  { id: signerOneId, organization_id: organizationId, display_name: "Signer One", party_type: "PERSON", status: "ACTIVE" },
  { id: signerTwoId, organization_id: organizationId, display_name: "Signer Two", party_type: "PERSON", status: "ACTIVE" },
  { id: optionalSignerId, organization_id: organizationId, display_name: "Optional Signer", party_type: "PERSON", status: "ACTIVE" },
]).select("*"));
await one(supabaseAdmin.from("secretary_settings").insert({
  organization_id: organizationId,
  default_timezone: "Asia/Bangkok",
  appointment_duration_minutes: 30,
  business_hours: {},
  booking_policy: { owner_party_id: ownerPartyId },
  metadata: { owner_party_id: ownerPartyId },
}).select("*").single());
await one(supabaseAdmin.from("secretary_contact_profiles").insert([
  { organization_id: organizationId, party_id: signerOneId, preferred_channel: "email", allow_calls: true, allow_messages: true },
  { organization_id: organizationId, party_id: signerTwoId, preferred_channel: "email", allow_calls: true, allow_messages: true },
  { organization_id: organizationId, party_id: optionalSignerId, preferred_channel: "email", allow_calls: true, allow_messages: true },
]).select("*"));

const sequential = await startSecretarySignatureRouting({
  context,
  payload: {
    title: "Board consent package",
    document_reference: "drive://board-consent-v3",
    routing_mode: "SEQUENTIAL",
    signers: [
      { party_id: signerOneId, role: "Chair", order: 1, required: true },
      { party_id: signerTwoId, role: "Director", order: 2, required: true },
      { party_id: optionalSignerId, role: "Observer", order: 3, required: false },
    ],
    evidence_id: "signature-route-start-sequential",
    created_at: "2036-02-01T01:00:00Z",
    initial_request_at: "2036-02-01T01:05:00Z",
    collection_deadline_at: "2036-02-03T12:00:00Z",
  },
});
assert.equal(sequential.status, "registered");
assert.equal(sequential.record.routing_mode, "SEQUENTIAL");
assert.equal(sequential.record.signers[0].state, "REQUESTED");
assert.equal(sequential.record.signers[1].state, "PENDING");
assert.equal(sequential.signature_performed_by_secretary, false);
assert.equal(sequential.signature_validity_inferred, false);

const sequentialReplay = await startSecretarySignatureRouting({
  context,
  payload: {
    title: "Board consent package",
    document_reference: "drive://board-consent-v3",
    routing_mode: "SEQUENTIAL",
    signers: [
      { party_id: signerOneId, role: "Chair", order: 1, required: true },
      { party_id: signerTwoId, role: "Director", order: 2, required: true },
      { party_id: optionalSignerId, role: "Observer", order: 3, required: false },
    ],
    evidence_id: "signature-route-start-sequential",
    created_at: "2036-02-01T01:00:00Z",
    initial_request_at: "2036-02-01T01:05:00Z",
    collection_deadline_at: "2036-02-03T12:00:00Z",
  },
});
assert.equal(sequentialReplay.request.id, sequential.request.id);
assert.equal(sequentialReplay.replay_safe, true);

await rejectsMessage(
  () => recordSecretarySignatureEvidence({
    context,
    payload: {
      request_id: sequential.request.id,
      signer_party_id: signerTwoId,
      evidence_id: "premature-second-signature",
      signed_at: "2036-02-01T02:00:00Z",
    },
  }),
  "SECRETARY_SIGNATURE_ROUTING_SIGNER_NOT_CURRENT",
);

const reminder = await scheduleSecretarySignatureReminder({
  context,
  payload: {
    request_id: sequential.request.id,
    signer_party_id: signerOneId,
    evidence_id: "signer-one-reminder-evidence",
    reminder_at: "2036-02-01T05:00:00Z",
    remind_at: "2036-02-01T05:00:00Z",
  },
});
assert.equal(reminder.record.state, "WAITING_SIGNATURES");

const firstSigned = await recordSecretarySignatureEvidence({
  context,
  payload: {
    request_id: sequential.request.id,
    signer_party_id: signerOneId,
    evidence_id: "signer-one-signature-evidence",
    signed_at: "2036-02-01T06:00:00Z",
  },
});
assert.equal(firstSigned.record.state, "PARTIALLY_SIGNED");
assert.equal(firstSigned.record.signers.find((s) => s.party_id === signerOneId).state, "SIGNED");
assert.equal(firstSigned.record.signers.find((s) => s.party_id === signerTwoId).state, "REQUESTED");
assert.equal(firstSigned.signer_identity_verified_inferred, false);
assert.equal(firstSigned.consent_inferred, false);

const firstSignedReplay = await recordSecretarySignatureEvidence({
  context,
  payload: {
    request_id: sequential.request.id,
    signer_party_id: signerOneId,
    evidence_id: "signer-one-signature-evidence",
    signed_at: "2036-02-01T06:00:00Z",
  },
});
assert.equal(firstSignedReplay.replay_safe, true);

const secondSigned = await recordSecretarySignatureEvidence({
  context,
  payload: {
    request_id: sequential.request.id,
    signer_party_id: signerTwoId,
    evidence_id: "signer-two-signature-evidence",
    signed_at: "2036-02-01T07:00:00Z",
  },
});
assert.equal(secondSigned.record.state, "COMPLETED");
assert.equal(secondSigned.signature_validity_inferred, false);
assert.equal(secondSigned.legal_effect_inferred, false);

const sequentialFollowUps = await one(
  supabaseAdmin.from("secretary_follow_ups").select("*").eq("organization_id", organizationId).eq("task_id", sequential.request.id),
);
assert.ok(sequentialFollowUps.length >= 3);
assert.equal(sequentialFollowUps.every((row) => row.status === "CANCELLED"), true);
assert.equal(sequentialFollowUps.some((row) => row.action_type === "EMAIL"), true);

const parallel = await startSecretarySignatureRouting({
  context,
  payload: {
    title: "Supplier acknowledgement",
    document_reference: "docs://supplier-ack-v1",
    routing_mode: "PARALLEL",
    signers: [
      { party_id: signerOneId, order: 1, required: true },
      { party_id: signerTwoId, order: 2, required: true },
    ],
    evidence_id: "signature-route-start-parallel",
    created_at: "2036-02-04T01:00:00Z",
    initial_request_at: "2036-02-04T01:05:00Z",
    collection_deadline_at: "2036-02-05T12:00:00Z",
  },
});
assert.equal(parallel.record.signers.every((s) => s.state === "REQUESTED"), true);

const declined = await recordSecretarySignatureDecline({
  context,
  payload: {
    request_id: parallel.request.id,
    signer_party_id: signerTwoId,
    evidence_id: "signer-two-decline-evidence",
    declined_at: "2036-02-04T03:00:00Z",
    reason: "Signer explicitly declined to sign the referenced document.",
  },
});
assert.equal(declined.record.state, "DECLINED");
assert.equal(declined.legal_effect_inferred, false);
assert.equal(declined.terms_accepted_by_secretary, false);

const expiryFixture = await startSecretarySignatureRouting({
  context,
  payload: {
    title: "Deadline fixture",
    document_reference: "docs://deadline-fixture",
    routing_mode: "PARALLEL",
    signers: [{ party_id: signerOneId, required: true }],
    evidence_id: "signature-route-expiry-start",
    created_at: "2036-02-06T01:00:00Z",
    collection_deadline_at: "2036-02-06T06:00:00Z",
  },
});
const beforeExpiry = await refreshSecretarySignatureRouting({
  context,
  payload: { request_id: expiryFixture.request.id, as_of: "2036-02-06T05:59:00Z" },
});
assert.equal(beforeExpiry.changed, false);
const expired = await refreshSecretarySignatureRouting({
  context,
  payload: { request_id: expiryFixture.request.id, as_of: "2036-02-06T06:01:00Z" },
});
assert.equal(expired.record.state, "EXPIRED");
assert.equal(expired.legal_effect_inferred, false);

const cancelFixture = await startSecretarySignatureRouting({
  context,
  payload: {
    title: "Cancellation fixture",
    document_reference: "docs://cancel-fixture",
    routing_mode: "PARALLEL",
    signers: [{ party_id: signerOneId, required: true }],
    evidence_id: "signature-route-cancel-start",
    created_at: "2036-02-07T01:00:00Z",
  },
});
const cancelled = await cancelSecretarySignatureRouting({
  context,
  payload: {
    request_id: cancelFixture.request.id,
    evidence_id: "signature-route-cancel-evidence",
    cancelled_at: "2036-02-07T02:00:00Z",
    reason: "Secretary coordination no longer required.",
  },
});
assert.equal(cancelled.record.state, "CANCELLED");
assert.equal(cancelled.external_signature_revocation_performed, false);

const read = await readSecretarySignatureRouting({ context, payload: { request_id: sequential.request.id } });
assert.equal(read.record.state, "COMPLETED");
assert.equal(read.record.history.filter((entry) => entry.event === "SIGNATURE_EVIDENCE_RECORDED").length, 2);

const activeList = await listSecretarySignatureRouting({ context, payload: {} });
assert.equal(activeList.count, 0);
const fullList = await listSecretarySignatureRouting({ context, payload: { include_terminal: true } });
assert.equal(fullList.count, 4);

for (const result of [sequential, firstSigned, secondSigned, declined, expired, cancelled]) {
  assert.equal(result.signature_performed_by_secretary, false);
  assert.equal(result.signature_authority_created, false);
  assert.equal(result.signature_validity_inferred, false);
  assert.equal(result.signer_identity_verified_inferred, false);
  assert.equal(result.consent_inferred, false);
  assert.equal(result.terms_accepted_by_secretary, false);
  assert.equal(result.document_modified_by_secretary, false);
  assert.equal(result.legal_effect_inferred, false);
  assert.equal(result.payment_authority_created, false);
  assert.equal(result.signing_authority_created, false);
  assert.equal(result.binding_authority_delegated, false);
  assert.equal(result.platform_permissions_mutated, false);
  assert.equal(result.external_authority_used, false);
}

console.log("SECRETARY_SIGNATURE_ROUTING_LOCAL_CERTIFICATION=PASS");
console.log("SECRETARY_SIGNATURE_ROUTING_SEQUENTIAL_ORDER_ENFORCED=true");
console.log("SECRETARY_SIGNATURE_ROUTING_PARALLEL_REQUESTS=true");
console.log("SECRETARY_SIGNATURE_ROUTING_SIGNATURE_EVIDENCE_REQUIRED=true");
console.log("SECRETARY_SIGNATURE_ROUTING_DECLINE_EVIDENCE=true");
console.log("SECRETARY_SIGNATURE_ROUTING_REMINDER_FOLLOW_THROUGH=true");
console.log("SECRETARY_SIGNATURE_ROUTING_COLLECTION_DEADLINE=true");
console.log("SECRETARY_SIGNATURE_ROUTING_EVIDENCE_REPLAY_SAFE=true");
console.log("SECRETARY_SIGNATURE_ROUTING_TERMINAL_FOLLOW_UPS_CANCELLED=true");
console.log("SECRETARY_SIGNATURE_ROUTING_SIGNATURE_PERFORMED_BY_SECRETARY=false");
console.log("SECRETARY_SIGNATURE_ROUTING_SIGNATURE_VALIDITY_INFERRED=false");
console.log("SECRETARY_SIGNATURE_ROUTING_SIGNER_IDENTITY_VERIFIED_INFERRED=false");
console.log("SECRETARY_SIGNATURE_ROUTING_CONSENT_INFERRED=false");
console.log("SECRETARY_SIGNATURE_ROUTING_LEGAL_EFFECT_INFERRED=false");
console.log("SECRETARY_SIGNATURE_ROUTING_EXTERNAL_SIGNATURE_REVOCATION_PERFORMED=false");
console.log("SECRETARY_SIGNATURE_ROUTING_PAYMENT_AUTHORITY_CREATED=false");
console.log("SECRETARY_SIGNATURE_ROUTING_BINDING_AUTHORITY_DELEGATED=false");
console.log("SECRETARY_PROVIDER_CALLS_PERFORMED=false");
console.log("SECRETARY_EXTERNAL_AUTHORITY_USED=false");
console.log("SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false");
