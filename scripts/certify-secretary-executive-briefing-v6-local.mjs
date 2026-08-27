import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "../lib/shared/supabase/admin.js";
import { readSecretaryExecutiveBriefingV6 } from "../lib/operator/secretary/SecretaryExecutiveBriefingV6Runtime.js";

const organizationId = randomUUID();
const ownerPartyId = randomUUID();
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

await one(supabaseAdmin.from("organizations").insert({ id: organizationId, name: "Secretary Executive Briefing V6 Local Cert" }).select("*").single());
await one(supabaseAdmin.from("parties").insert({ id: ownerPartyId, organization_id: organizationId, display_name: "Executive Owner", party_type: "PERSON", status: "ACTIVE" }).select("*").single());
await one(supabaseAdmin.from("secretary_settings").insert({
  organization_id: organizationId,
  default_timezone: "Asia/Bangkok",
  appointment_duration_minutes: 30,
  business_hours: {},
  booking_policy: { owner_party_id: ownerPartyId },
  metadata: { owner_party_id: ownerPartyId },
}).select("*").single());

const decisionTaskId = randomUUID();
await one(supabaseAdmin.from("secretary_tasks").insert({
  id: decisionTaskId,
  organization_id: organizationId,
  owner_party_id: ownerPartyId,
  title: "Decision: Launch pilot in Singapore",
  details: "Launch pilot in Singapore",
  status: "DONE",
  priority: "NORMAL",
  completed_at: "2035-04-01T02:00:00Z",
  source: "secretary_decision_register",
  created_by_party_id: ownerPartyId,
  metadata: {
    secretary_decision_register: true,
    secretary_decision_register_contract: "AVANTIQO_EXECUTIVE_SECRETARY_DECISION_REGISTER_V1",
    canonical_owner_party_id: ownerPartyId,
    operational_assignee_party_id: ownerPartyId,
    decision_register_v1: {
      contract: "AVANTIQO_EXECUTIVE_SECRETARY_DECISION_REGISTER_V1",
      lineage_id: decisionTaskId,
      revision: 1,
      current_version_id: "decision-v6-version-1",
      state: "CURRENT",
      versions: [{
        version_id: "decision-v6-version-1",
        version_number: 1,
        state: "CURRENT",
        decision_text: "Launch pilot in Singapore",
        evidence_id: "decision-v6-evidence",
        decided_at: "2035-04-01T01:00:00Z",
        source_kind: "DIRECT_EVIDENCE",
        follow_through_task_id: null,
        decision_timestamp_inferred: false,
        decision_text_inferred: false,
        decision_owner_inferred: false,
        follow_through_inferred: false,
        decision_made_by_secretary: false,
        decision_authority_created: false,
      }],
      history: [{ event: "DECISION_RECORDED", revision: 1, version_id: "decision-v6-version-1", evidence_id: "decision-v6-evidence" }],
      decision_inferred: false,
      decision_authority_created: false,
      approval_authority_delegated: false,
      binding_authority_delegated: false,
      platform_permissions_mutated: false,
      external_authority_used: false,
    },
  },
}).select("*").single());

const travelJobId = randomUUID();
await one(supabaseAdmin.from("secretary_jobs").insert({
  id: travelJobId,
  organization_id: organizationId,
  requested_by_party_id: ownerPartyId,
  source_kind: "MANUAL",
  objective: "Coordinate Singapore trip",
  success_criteria: ["Keep itinerary current"],
  status: "ACTIVE",
  autonomy_level: "EXECUTE_WITH_GATES",
  approval_policy: { travel_booking_requires_exact_step_approval: true },
  execution_plan: [],
  metadata: {
    job_kind: "TRAVEL_COORDINATION",
    canonical_owner_party_id: ownerPartyId,
    travel_coordination: { origin: "Phuket", destination: "Singapore" },
    travel_operations_v1: {
      contract: "AVANTIQO_EXECUTIVE_SECRETARY_TRAVEL_OPERATIONS_V1",
      version: 2,
      confirmations: [
        {
          confirmation_id: "v6-active-flight",
          kind: "FLIGHT",
          title: "Phuket to Singapore",
          confirmation_reference: "V6-SQ-001",
          starts_at: "2035-04-10T03:00:00Z",
          ends_at: "2035-04-10T05:00:00Z",
          evidence_id: "v6-active-flight-evidence",
          status: "CONFIRMED",
          version: 1,
          confirmation_inferred: false,
        },
        {
          confirmation_id: "v6-cancelled-hotel",
          kind: "HOTEL",
          title: "Singapore hotel",
          confirmation_reference: "V6-HOTEL-001",
          evidence_id: "v6-hotel-confirmation-evidence",
          status: "CANCELLED",
          version: 1,
          cancellation_id: "v6-cancel-event",
          cancellation_evidence_id: "v6-hotel-cancel-evidence",
          cancelled_at: "2035-04-05T06:00:00Z",
          cancellation_inferred: false,
          cancellation_intent_is_cancellation: false,
        },
      ],
      disruptions: [],
      history: [{
        event: "CONFIRMATION_CANCELLED",
        version: 2,
        confirmation_id: "v6-cancelled-hotel",
        cancellation_id: "v6-cancel-event",
        evidence_id: "v6-hotel-cancel-evidence",
        outcome: "CANCELLED",
        cancelled_at: "2035-04-05T06:00:00Z",
        cancellation_inferred: false,
      }],
      researched_option_is_confirmation: false,
      booking_authority_created: false,
      payment_authority_created: false,
      binding_authority_created: false,
      external_authority_used: false,
    },
  },
}).select("*").single());

await one(supabaseAdmin.from("secretary_job_steps").insert({
  organization_id: organizationId,
  job_id: travelJobId,
  sequence_number: 1,
  action_type: "REVIEW",
  instruction: "Approve exact replacement fare if required",
  status: "APPROVAL_REQUIRED",
  requires_approval: true,
  metadata: { authority_scope: "THIS_STEP_ONLY" },
}).select("*").single());

const result = await readSecretaryExecutiveBriefingV6({
  context,
  payload: {
    cadence: "DAILY",
    from: "2035-04-10T00:00:00Z",
    to: "2035-04-11T00:00:00Z",
    now: "2035-04-10T00:00:00Z",
    limit: 100,
  },
});

assert.equal(result.contract, "AVANTIQO_EXECUTIVE_SECRETARY_DESK_BRIEFING_V6");
assert.equal(result.evidence_only, true);
assert.equal(result.decision_inferred, false);
assert.equal(result.decision_timestamp_inferred, false);
assert.equal(result.decision_made_by_secretary, false);
assert.equal(result.travel_cancellation_inferred, false);
assert.equal(result.travel_cancellation_intent_is_cancellation, false);
assert.equal(result.booking_authority_created, false);
assert.equal(result.payment_authority_created, false);
assert.equal(result.binding_authority_created, false);
assert.equal(result.platform_permissions_mutated, false);
assert.equal(result.external_authority_used, false);
assert.equal(result.source_status.complete, true);

assert.equal(result.executive_desk.current_decision_count, 1);
assert.equal(result.executive_desk.retracted_decision_count, 0);
assert.equal(result.executive_desk.decision_register.current[0].current_version.decision_text, "Launch pilot in Singapore");
assert.equal(result.executive_desk.decision_register.counted_again_in_v6_exception_total, false);
assert.equal(result.executive_desk.travel_operations.active_job_count, 1);
assert.equal(result.executive_desk.travel_operations.confirmed_itinerary_item_count, 1);
assert.equal(result.executive_desk.travel_operations.cancelled_item_count, 1);
assert.equal(result.executive_desk.travel_operations.voided_item_count, 0);
assert.equal(result.executive_desk.travel_operations.cancelled_confirmations.length, 1);
assert.equal(result.executive_desk.travel_operations.cancellation_history.length, 1);
assert.equal(result.executive_desk.travel_operations.approval_required_step_count, 1);
assert.equal(result.executive_desk.travel_operations.cancellation_history_counted_again_in_v6_exception_total, false);

assert.equal(result.executive_desk.exception_count, result.underlying_v5.executive_desk.exception_count);
assert.equal(result.executive_desk.secretary_owned_count, result.underlying_v5.executive_desk.secretary_owned_count);
assert.equal(result.executive_desk.counting_policy.v5_exception_count_preserved, true);
assert.equal(result.executive_desk.counting_policy.v5_secretary_owned_count_preserved, true);
assert.equal(result.executive_desk.counting_policy.decision_register_not_added_again, true);
assert.equal(result.executive_desk.counting_policy.travel_cancellation_history_not_added_again, true);

console.log("SECRETARY_EXECUTIVE_BRIEFING_V6_LOCAL_CERTIFICATION=PASS");
console.log("SECRETARY_EXECUTIVE_BRIEFING_V6_DECISION_REGISTER_VISIBLE=true");
console.log("SECRETARY_EXECUTIVE_BRIEFING_V6_TRAVEL_CANCELLATION_VISIBLE=true");
console.log("SECRETARY_EXECUTIVE_BRIEFING_V6_APPROVAL_GATE_VISIBLE=true");
console.log("SECRETARY_EXECUTIVE_BRIEFING_V6_V5_EXCEPTION_COUNT_PRESERVED=true");
console.log("SECRETARY_EXECUTIVE_BRIEFING_V6_V5_SECRETARY_OWNED_COUNT_PRESERVED=true");
console.log("SECRETARY_EXECUTIVE_BRIEFING_V6_DECISIONS_DOUBLE_COUNTED=false");
console.log("SECRETARY_EXECUTIVE_BRIEFING_V6_TRAVEL_CANCELLATIONS_DOUBLE_COUNTED=false");
console.log("SECRETARY_EXECUTIVE_BRIEFING_V6_DECISION_INFERRED=false");
console.log("SECRETARY_EXECUTIVE_BRIEFING_V6_TRAVEL_CANCELLATION_INFERRED=false");
console.log("SECRETARY_EXECUTIVE_BRIEFING_V6_PLATFORM_PERMISSIONS_MUTATED=false");
console.log("SECRETARY_EXECUTIVE_BRIEFING_V6_BINDING_AUTHORITY_CREATED=false");
console.log("SECRETARY_EXECUTIVE_BRIEFING_V6_BOOKING_AUTHORITY_CREATED=false");
console.log("SECRETARY_EXECUTIVE_BRIEFING_V6_PAYMENT_AUTHORITY_CREATED=false");
console.log("SECRETARY_PROVIDER_CALLS_PERFORMED=false");
console.log("SECRETARY_EXTERNAL_AUTHORITY_USED=false");
console.log("SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false");
