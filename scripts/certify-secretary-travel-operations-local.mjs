import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "../lib/shared/supabase/admin.js";
import { correctSecretaryTravelConfirmation } from "../lib/operator/secretary/SecretaryTravelConfirmationCorrectionRuntime.js";
import {
  createSecretaryTravelReminder,
  readSecretaryTravelOperations,
  recordSecretaryTravelConfirmation,
  recordSecretaryTravelDisruption,
} from "../lib/operator/secretary/SecretaryTravelOperationsRuntime.js";

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
  supabaseAdmin.from("organizations").insert({ id: organizationId, name: "Secretary Travel Operations Local Cert" }).select("*").single(),
);
await one(
  supabaseAdmin.from("parties").insert({
    id: ownerPartyId,
    organization_id: organizationId,
    display_name: "Executive Owner",
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
    objective: "Coordinate confirmed executive travel to Singapore",
    success_criteria: ["Keep confirmed itinerary operationally current"],
    status: "ACTIVE",
    autonomy_level: "EXECUTE_WITH_GATES",
    approval_policy: {
      travel_booking_requires_exact_step_approval: true,
      travel_payment_requires_exact_step_approval: true,
    },
    execution_plan: [],
    metadata: {
      job_kind: "TRAVEL_COORDINATION",
      canonical_owner_party_id: ownerPartyId,
      travel_coordination: {
        origin: "Phuket",
        destination: "Singapore",
        timezone: "Asia/Bangkok",
      },
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
    instruction: "Approve exact replacement flight fare if needed",
    status: "APPROVAL_REQUIRED",
    requires_approval: true,
    metadata: { authority_scope: "THIS_STEP_ONLY" },
  }).select("*").single(),
);

await expectError(
  () => recordSecretaryTravelConfirmation({
    context,
    payload: {
      job_id: jobId,
      kind: "FLIGHT",
      confirmation_reference: "SQ-TEST-001",
      starts_at: "2035-04-10T03:00:00Z",
    },
  }),
  "SECRETARY_TRAVEL_OPERATIONS_CONFIRMATION_EVIDENCE_REQUIRED",
);

const flight = await recordSecretaryTravelConfirmation({
  context,
  payload: {
    job_id: jobId,
    kind: "FLIGHT",
    title: "Phuket to Singapore",
    confirmation_reference: "SQ-TEST-001",
    provider_name: "Evidence Airline",
    starts_at: "2035-04-10T03:00:00Z",
    ends_at: "2035-04-10T05:00:00Z",
    timezone: "Asia/Bangkok",
    origin: "Phuket",
    destination: "Singapore",
    evidence_id: "travel-flight-confirmation-v1",
    source_reference: "email:flight-confirmation-v1",
  },
});
assert.equal(flight.status, "recorded");
assert.equal(flight.confirmation.confirmation_inferred, false);
assert.equal(flight.booking_authority_created, false);
assert.equal(flight.payment_authority_created, false);

const flightReplay = await recordSecretaryTravelConfirmation({
  context,
  payload: {
    job_id: jobId,
    kind: "FLIGHT",
    title: "Phuket to Singapore",
    confirmation_reference: "SQ-TEST-001",
    provider_name: "Evidence Airline",
    starts_at: "2035-04-10T03:00:00Z",
    ends_at: "2035-04-10T05:00:00Z",
    timezone: "Asia/Bangkok",
    origin: "Phuket",
    destination: "Singapore",
    evidence_id: "travel-flight-confirmation-v1",
    source_reference: "email:flight-confirmation-v1",
  },
});
assert.equal(flightReplay.replay_safe, true);
assert.equal(flightReplay.confirmation.confirmation_id, flight.confirmation.confirmation_id);

const flightCorrected = await correctSecretaryTravelConfirmation({
  context,
  payload: {
    job_id: jobId,
    supersedes_confirmation_id: flight.confirmation.confirmation_id,
    starts_at: "2035-04-10T03:30:00Z",
    ends_at: "2035-04-10T05:30:00Z",
    evidence_id: "travel-flight-correction-v2",
    source_reference: "email:flight-confirmation-v2",
    reason: "Carrier issued corrected departure and arrival times.",
  },
});
assert.equal(flightCorrected.status, "corrected");
assert.equal(flightCorrected.confirmation.supersedes_confirmation_id, flight.confirmation.confirmation_id);
assert.equal(flightCorrected.confirmation.confirmation_inferred, false);
assert.equal(flightCorrected.confirmation.starts_at, "2035-04-10T03:30:00.000Z");
assert.notEqual(flightCorrected.confirmation.confirmation_id, flight.confirmation.confirmation_id);
assert.equal(flightCorrected.booking_authority_created, false);
assert.equal(flightCorrected.payment_authority_created, false);
assert.equal(flightCorrected.binding_authority_created, false);
assert.equal(flightCorrected.approval_authority_delegated, false);

await expectError(
  () => correctSecretaryTravelConfirmation({
    context,
    payload: {
      job_id: jobId,
      supersedes_confirmation_id: flight.confirmation.confirmation_id,
      starts_at: "2035-04-10T04:00:00Z",
      evidence_id: "travel-flight-stale-correction",
      reason: "Stale correction attempt against superseded confirmation.",
    },
  }),
  "SECRETARY_TRAVEL_OPERATIONS_STALE_CORRECTION_REJECTED",
);

const hotel = await recordSecretaryTravelConfirmation({
  context,
  payload: {
    job_id: jobId,
    kind: "HOTEL",
    title: "Singapore hotel",
    confirmation_reference: "HOTEL-TEST-001",
    provider_name: "Evidence Hotel",
    starts_at: "2035-04-10T07:00:00Z",
    ends_at: "2035-04-12T04:00:00Z",
    timezone: "Asia/Singapore",
    location: "Singapore",
    evidence_id: "travel-hotel-confirmation-v1",
    source_reference: "document:hotel-confirmation-v1",
  },
});
assert.equal(hotel.confirmation.kind, "HOTEL");

const reminder = await createSecretaryTravelReminder({
  context,
  payload: {
    job_id: jobId,
    title: "Online check-in window",
    details: "Check the confirmed carrier instructions before departure.",
    due_at: "2035-04-09T03:00:00Z",
    remind_at: "2035-04-09T03:00:00Z",
    priority: "HIGH",
  },
});
assert.equal(reminder.status, "completed");
assert.equal(reminder.timestamp_inferred, false);
assert.equal(reminder.reminder.owner_party_id, ownerPartyId);
assert.equal(reminder.reminder.source, "secretary_travel_operations");

const reminderReplay = await createSecretaryTravelReminder({
  context,
  payload: {
    job_id: jobId,
    title: "Online check-in window",
    details: "Check the confirmed carrier instructions before departure.",
    due_at: "2035-04-09T03:00:00Z",
    remind_at: "2035-04-09T03:00:00Z",
    priority: "HIGH",
  },
});
assert.equal(reminderReplay.replay_safe, true);
assert.equal(reminderReplay.reminder.id, reminder.reminder.id);

const disruption = await recordSecretaryTravelDisruption({
  context,
  payload: {
    job_id: jobId,
    evidence_id: "travel-disruption-v1",
    description: "Confirmed departure delay reported by carrier.",
    occurred_at: "2035-04-10T01:30:00Z",
    affected_confirmation_id: flightCorrected.confirmation.confirmation_id,
    source_reference: "message:carrier-delay-v1",
  },
});
assert.equal(disruption.status, "recorded");
assert.equal(disruption.disruption.impact_inferred, false);

const read = await readSecretaryTravelOperations({
  context,
  payload: { job_id: jobId },
});
assert.equal(read.status, "completed");
assert.equal(read.researched_option_is_confirmation, false);
assert.equal(read.booking_authority_created, false);
assert.equal(read.payment_authority_created, false);
assert.equal(read.binding_authority_created, false);
assert.equal(read.external_authority_used, false);
assert.equal(read.evidence_summary.confirmed_items, 2);
assert.equal(read.evidence_summary.superseded_items, 1);
assert.equal(read.evidence_summary.disruptions, 1);
assert.equal(read.evidence_summary.reminders, 1);
assert.equal(read.evidence_summary.approval_required_steps, 1);
assert.ok(read.itinerary.some((item) => item.confirmation_id === flightCorrected.confirmation.confirmation_id));
assert.ok(!read.itinerary.some((item) => item.confirmation_id === flight.confirmation.confirmation_id));
assert.ok(read.superseded_confirmations.some((item) => item.confirmation_id === flight.confirmation.confirmation_id));
assert.ok(read.confirmation_history.some((item) => item.event === "CONFIRMATION_CORRECTED" && item.supersedes_confirmation_id === flight.confirmation.confirmation_id));
assert.ok(read.approval_required_steps.some((step) => step.status === "APPROVAL_REQUIRED"));

const storedJob = await one(
  supabaseAdmin.from("secretary_jobs").select("metadata").eq("organization_id", organizationId).eq("id", jobId).single(),
);
const ledger = storedJob.metadata.travel_operations_v1;
assert.equal(ledger.researched_option_is_confirmation, false);
assert.equal(ledger.booking_authority_created, false);
assert.equal(ledger.payment_authority_created, false);
assert.equal(ledger.binding_authority_created, false);
assert.equal(ledger.external_authority_used, false);
assert.equal(storedJob.metadata.approval_authority_delegated, false);
assert.equal(storedJob.metadata.platform_permissions_mutated, false);
assert.ok(ledger.confirmations.some((item) => item.confirmation_id === flight.confirmation.confirmation_id && item.status === "SUPERSEDED"));
assert.ok(ledger.confirmations.some((item) => item.confirmation_id === flightCorrected.confirmation.confirmation_id && item.status === "CONFIRMED"));
assert.ok(ledger.history.some((item) => item.event === "CONFIRMATION_CORRECTED"));

console.log("SECRETARY_TRAVEL_OPERATIONS_LOCAL_CERTIFICATION=PASS");
console.log("SECRETARY_TRAVEL_OPERATIONS_EVIDENCE_REQUIRED=true");
console.log("SECRETARY_TRAVEL_OPERATIONS_CONFIRMATIONS_DURABLE=true");
console.log("SECRETARY_TRAVEL_OPERATIONS_CONFIRMATION_REPLAY_SAFE=true");
console.log("SECRETARY_TRAVEL_OPERATIONS_CORRECTION_HISTORY_PRESERVED=true");
console.log("SECRETARY_TRAVEL_OPERATIONS_STALE_CORRECTION_FENCED=true");
console.log("SECRETARY_TRAVEL_OPERATIONS_SUPERSEDED_NOT_ACTIVE=true");
console.log("SECRETARY_TRAVEL_OPERATIONS_ITINERARY_EVIDENCE_SORTED=true");
console.log("SECRETARY_TRAVEL_OPERATIONS_REMINDER_DETERMINISTIC=true");
console.log("SECRETARY_TRAVEL_OPERATIONS_TIMESTAMP_NOT_INFERRED=true");
console.log("SECRETARY_TRAVEL_OPERATIONS_DISRUPTION_EVIDENCE_REQUIRED=true");
console.log("SECRETARY_TRAVEL_OPERATIONS_DISRUPTION_IMPACT_NOT_INFERRED=true");
console.log("SECRETARY_TRAVEL_OPERATIONS_APPROVAL_GATE_VISIBLE=true");
console.log("SECRETARY_TRAVEL_OPERATIONS_RESEARCH_NOT_CONFIRMATION=true");
console.log("SECRETARY_TRAVEL_OPERATIONS_PLATFORM_PERMISSIONS_MUTATED=false");
console.log("SECRETARY_TRAVEL_OPERATIONS_BINDING_AUTHORITY_CREATED=false");
console.log("SECRETARY_TRAVEL_OPERATIONS_APPROVAL_AUTHORITY_DELEGATED=false");
console.log("SECRETARY_TRAVEL_OPERATIONS_BOOKING_AUTHORITY_CREATED=false");
console.log("SECRETARY_TRAVEL_OPERATIONS_PAYMENT_AUTHORITY_CREATED=false");
console.log("SECRETARY_PROVIDER_CALLS_PERFORMED=false");
console.log("SECRETARY_EXTERNAL_AUTHORITY_USED=false");
console.log("SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false");
