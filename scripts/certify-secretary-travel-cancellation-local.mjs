import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "../lib/shared/supabase/admin.js";
import { recordSecretaryTravelCancellation } from "../lib/operator/secretary/SecretaryTravelCancellationRuntime.js";
import { readSecretaryTravelOperationsV2 } from "../lib/operator/secretary/SecretaryTravelOperationsReadV2Runtime.js";
import { recordSecretaryTravelConfirmation } from "../lib/operator/secretary/SecretaryTravelOperationsRuntime.js";

const organizationId = randomUUID();
const ownerPartyId = randomUUID();
const jobId = randomUUID();
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

async function expectError(fn, expected) {
  let error = null;
  try {
    await fn();
  } catch (caught) {
    error = caught;
  }
  assert.ok(error, `Expected error ${expected}`);
  assert.equal(error.message, expected);
}

await one(
  supabaseAdmin.from("organizations").insert({ id: organizationId, name: "Secretary Travel Cancellation Local Cert" }).select("*").single(),
);
await one(
  supabaseAdmin.from("parties").insert({
    id: ownerPartyId,
    organization_id: organizationId,
    display_name: "Travel Cancellation Executive",
    party_type: "PERSON",
    status: "ACTIVE",
  }).select("*").single(),
);
await one(
  supabaseAdmin.from("secretary_settings").insert({
    organization_id: organizationId,
    default_timezone: "Asia/Bangkok",
    booking_policy: { owner_party_id: ownerPartyId },
    metadata: { owner_party_id: ownerPartyId },
  }).select("*").single(),
);
await one(
  supabaseAdmin.from("secretary_jobs").insert({
    id: jobId,
    organization_id: organizationId,
    requested_by_party_id: ownerPartyId,
    source_kind: "MANUAL",
    objective: "Coordinate executive travel and preserve cancellation evidence",
    success_criteria: ["Keep active itinerary and cancellation history evidence-backed"],
    status: "ACTIVE",
    autonomy_level: "EXECUTE_WITH_GATES",
    approval_policy: {
      travel_booking_requires_exact_step_approval: true,
      travel_payment_requires_exact_step_approval: true,
      cancellation_fee_requires_exact_step_approval: true,
    },
    execution_plan: [],
    metadata: {
      job_kind: "TRAVEL_COORDINATION",
      canonical_owner_party_id: ownerPartyId,
      travel_coordination: { origin: "Phuket", destination: "Singapore", timezone: "Asia/Bangkok" },
      external_booking_authority_created: false,
      payment_authority_created: false,
      external_authority_used: false,
    },
  }).select("*").single(),
);
await one(
  supabaseAdmin.from("secretary_job_steps").insert({
    organization_id: organizationId,
    job_id: jobId,
    sequence_number: 1,
    action_type: "REVIEW",
    instruction: "Approve exact cancellation fee, refund settlement, or replacement fare if required",
    status: "APPROVAL_REQUIRED",
    requires_approval: true,
    metadata: { authority_scope: "THIS_STEP_ONLY" },
  }).select("*").single(),
);

const flight = await recordSecretaryTravelConfirmation({
  context,
  payload: {
    job_id: jobId,
    kind: "FLIGHT",
    title: "Phuket to Singapore",
    confirmation_reference: "CANCEL-CERT-FLIGHT-001",
    provider_name: "Evidence Airline",
    starts_at: "2035-06-10T03:00:00Z",
    ends_at: "2035-06-10T05:00:00Z",
    timezone: "Asia/Bangkok",
    origin: "Phuket",
    destination: "Singapore",
    evidence_id: "travel-cancel-cert-confirmation",
    source_reference: "email:travel-cancel-cert-confirmation",
  },
});
assert.equal(flight.confirmation.status, "CONFIRMED");

await expectError(
  () => recordSecretaryTravelCancellation({
    context,
    payload: {
      job_id: jobId,
      confirmation_id: flight.confirmation.confirmation_id,
      outcome: "CANCELLED",
      cancelled_at: "2035-06-01T04:30:00Z",
    },
  }),
  "SECRETARY_TRAVEL_CANCELLATION_EVIDENCE_REQUIRED",
);

await expectError(
  () => recordSecretaryTravelCancellation({
    context,
    payload: {
      job_id: jobId,
      confirmation_id: flight.confirmation.confirmation_id,
      evidence_id: "provider-cancellation-evidence-v1",
      outcome: "CANCELLED",
    },
  }),
  "SECRETARY_TRAVEL_CANCELLATION_CANCELLED_AT_REQUIRED",
);

const cancellationPayload = {
  job_id: jobId,
  confirmation_id: flight.confirmation.confirmation_id,
  evidence_id: "provider-cancellation-evidence-v1",
  outcome: "CANCELLED",
  cancelled_at: "2035-06-01T04:30:00Z",
  cancellation_reference: "VOID-REF-001",
  reason: "Carrier evidence confirms the ticket was cancelled.",
  source_reference: "email:provider-cancellation-v1",
};
const cancelled = await recordSecretaryTravelCancellation({ context, payload: cancellationPayload });
assert.equal(cancelled.status, "recorded");
assert.equal(cancelled.contract, "AVANTIQO_EXECUTIVE_SECRETARY_TRAVEL_CANCELLATION_V1");
assert.equal(cancelled.confirmation.status, "CANCELLED");
assert.equal(cancelled.confirmation.confirmation_reference, "CANCEL-CERT-FLIGHT-001");
assert.equal(cancelled.confirmation.evidence_id, "travel-cancel-cert-confirmation");
assert.equal(cancelled.confirmation.cancellation_evidence_id, "provider-cancellation-evidence-v1");
assert.equal(cancelled.confirmation.cancelled_at, "2035-06-01T04:30:00.000Z");
assert.equal(cancelled.cancellation_timestamp_inferred, false);
assert.equal(cancelled.cancellation_inferred, false);
assert.equal(cancelled.cancellation_intent_is_cancellation, false);
assert.equal(cancelled.cancellation_request_sent, false);
assert.equal(cancelled.cancellation_fee_commitment_created, false);
assert.equal(cancelled.refund_settlement_authority_created, false);
assert.equal(cancelled.rebooking_authority_created, false);
assert.equal(cancelled.booking_authority_created, false);
assert.equal(cancelled.payment_authority_created, false);
assert.equal(cancelled.binding_authority_created, false);
assert.equal(cancelled.approval_authority_delegated, false);
assert.equal(cancelled.platform_permissions_mutated, false);
assert.equal(cancelled.external_authority_used, false);

const replay = await recordSecretaryTravelCancellation({ context, payload: cancellationPayload });
assert.equal(replay.replay_safe, true);
assert.equal(replay.cancellation_id, cancelled.cancellation_id);
assert.equal(replay.register_version, cancelled.register_version);

await expectError(
  () => recordSecretaryTravelCancellation({
    context,
    payload: {
      ...cancellationPayload,
      evidence_id: "conflicting-provider-cancellation-evidence",
      cancellation_reference: "VOID-REF-CONFLICT",
    },
  }),
  "SECRETARY_TRAVEL_CANCELLATION_STALE_CONFIRMATION_REJECTED",
);

const read = await readSecretaryTravelOperationsV2({ context, payload: { job_id: jobId } });
assert.equal(read.contract, "AVANTIQO_EXECUTIVE_SECRETARY_TRAVEL_OPERATIONS_READ_V2");
assert.ok(!read.itinerary.some((item) => item.confirmation_id === flight.confirmation.confirmation_id));
assert.ok(read.cancelled_confirmations.some((item) => item.confirmation_id === flight.confirmation.confirmation_id && item.status === "CANCELLED"));
assert.ok(read.cancellation_history.some((item) => item.event === "CONFIRMATION_CANCELLED" && item.confirmation_id === flight.confirmation.confirmation_id));
assert.equal(read.evidence_summary.confirmed_items, 0);
assert.equal(read.evidence_summary.cancelled_items, 1);
assert.equal(read.evidence_summary.voided_items, 0);
assert.equal(read.evidence_summary.approval_required_steps, 1);
assert.ok(read.approval_required_steps.some((step) => step.status === "APPROVAL_REQUIRED"));
assert.equal(read.cancellation_inferred, false);
assert.equal(read.cancellation_intent_is_cancellation, false);
assert.equal(read.cancellation_request_sent, false);
assert.equal(read.cancellation_fee_commitment_created, false);
assert.equal(read.refund_settlement_authority_created, false);
assert.equal(read.rebooking_authority_created, false);
assert.equal(read.booking_authority_created, false);
assert.equal(read.payment_authority_created, false);
assert.equal(read.binding_authority_created, false);
assert.equal(read.external_authority_used, false);

const storedJob = await one(
  supabaseAdmin.from("secretary_jobs").select("metadata").eq("organization_id", organizationId).eq("id", jobId).single(),
);
const ledger = storedJob.metadata.travel_operations_v1;
const storedCancellation = ledger.confirmations.find((item) => item.confirmation_id === flight.confirmation.confirmation_id);
assert.equal(storedCancellation.status, "CANCELLED");
assert.equal(storedCancellation.confirmation_reference, "CANCEL-CERT-FLIGHT-001");
assert.equal(storedCancellation.evidence_id, "travel-cancel-cert-confirmation");
assert.equal(storedCancellation.cancellation_evidence_id, "provider-cancellation-evidence-v1");
assert.ok(ledger.history.some((item) => item.event === "CONFIRMATION_CANCELLED" && item.evidence_id === "provider-cancellation-evidence-v1"));
assert.equal(ledger.cancellation_fee_commitment_created, false);
assert.equal(ledger.refund_settlement_authority_created, false);
assert.equal(ledger.rebooking_authority_created, false);
assert.equal(storedJob.metadata.approval_authority_delegated, false);
assert.equal(storedJob.metadata.platform_permissions_mutated, false);

console.log("SECRETARY_TRAVEL_CANCELLATION_LOCAL_CERTIFICATION=PASS");
console.log("SECRETARY_TRAVEL_CANCELLATION_EVIDENCE_REQUIRED=true");
console.log("SECRETARY_TRAVEL_CANCELLATION_TIMESTAMP_INFERRED=false");
console.log("SECRETARY_TRAVEL_CANCELLATION_CONFIRMATION_HISTORY_PRESERVED=true");
console.log("SECRETARY_TRAVEL_CANCELLATION_REPLAY_SAFE=true");
console.log("SECRETARY_TRAVEL_CANCELLATION_STALE_CONFIRMATION_FENCED=true");
console.log("SECRETARY_TRAVEL_CANCELLATION_NOT_ACTIVE=true");
console.log("SECRETARY_TRAVEL_CANCELLATION_INTENT_IS_CANCELLATION=false");
console.log("SECRETARY_TRAVEL_CANCELLATION_REQUEST_SENT=false");
console.log("SECRETARY_TRAVEL_CANCELLATION_APPROVAL_GATE_VISIBLE=true");
console.log("SECRETARY_TRAVEL_CANCELLATION_FEE_COMMITMENT_CREATED=false");
console.log("SECRETARY_TRAVEL_REFUND_SETTLEMENT_AUTHORITY_CREATED=false");
console.log("SECRETARY_TRAVEL_REBOOKING_AUTHORITY_CREATED=false");
console.log("SECRETARY_TRAVEL_CANCELLATION_PLATFORM_PERMISSIONS_MUTATED=false");
console.log("SECRETARY_TRAVEL_CANCELLATION_BINDING_AUTHORITY_CREATED=false");
console.log("SECRETARY_TRAVEL_CANCELLATION_APPROVAL_AUTHORITY_DELEGATED=false");
console.log("SECRETARY_TRAVEL_CANCELLATION_BOOKING_AUTHORITY_CREATED=false");
console.log("SECRETARY_TRAVEL_CANCELLATION_PAYMENT_AUTHORITY_CREATED=false");
console.log("SECRETARY_PROVIDER_CALLS_PERFORMED=false");
console.log("SECRETARY_EXTERNAL_AUTHORITY_USED=false");
console.log("SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false");
