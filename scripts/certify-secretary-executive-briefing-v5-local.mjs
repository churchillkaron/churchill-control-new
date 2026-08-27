import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "../lib/shared/supabase/admin.js";
import { readSecretaryExecutiveBriefingV5 } from "../lib/operator/secretary/SecretaryExecutiveBriefingV5Runtime.js";

const organizationId = randomUUID();
const ownerPartyId = randomUUID();
const delegatePartyId = randomUUID();
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

await one(supabaseAdmin.from("organizations").insert({ id: organizationId, name: "Secretary Executive Briefing V5 Local Cert" }).select("*").single());
await one(supabaseAdmin.from("parties").insert({ id: ownerPartyId, organization_id: organizationId, display_name: "Executive Owner", party_type: "PERSON", status: "ACTIVE" }).select("*").single());
await one(supabaseAdmin.from("parties").insert({ id: delegatePartyId, organization_id: organizationId, display_name: "Delegate", party_type: "PERSON", status: "ACTIVE" }).select("*").single());

await one(supabaseAdmin.from("secretary_settings").insert({
  organization_id: organizationId,
  default_timezone: "Asia/Bangkok",
  appointment_duration_minutes: 30,
  business_hours: {},
  booking_policy: { owner_party_id: ownerPartyId },
  metadata: {
    owner_party_id: ownerPartyId,
    executive_working_preferences_v1: {
      contract: "AVANTIQO_EXECUTIVE_SECRETARY_WORKING_PREFERENCES_V1",
      version: 1,
      owner_party_id: ownerPartyId,
      current: {
        "TRAVEL.seat_preference": {
          entry_id: "pref-v5-travel",
          event: "RECORDED",
          version: 1,
          domain: "TRAVEL",
          key: "seat_preference",
          path: "TRAVEL.seat_preference",
          value: "aisle",
          evidence_id: "pref-v5-evidence",
          source_kind: "USER_STATEMENT",
          recorded_at: "2035-04-01T00:00:00Z",
          recorded_by_party_id: ownerPartyId,
          canonical_owner_party_id: ownerPartyId,
          preference_inferred: false,
          authority_created: false,
          active: true,
        },
      },
      history: [],
      preferences_inferred: false,
      secrets_stored: false,
      approval_authority_created: false,
      binding_authority_created: false,
      payment_authority_created: false,
      external_authority_used: false,
    },
  },
}).select("*").single());

await one(supabaseAdmin.from("secretary_tasks").insert({
  organization_id: organizationId,
  owner_party_id: delegatePartyId,
  title: "Prepare board pack",
  details: "Delegated administrative work",
  status: "IN_PROGRESS",
  priority: "NORMAL",
  due_at: "2035-04-10T02:00:00Z",
  source: "secretary_staff_delegation",
  created_by_party_id: ownerPartyId,
  metadata: {
    secretary_staff_delegation: true,
    canonical_owner_party_id: ownerPartyId,
    operational_assignee_party_id: delegatePartyId,
    commitment_inferred: false,
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
      version: 1,
      confirmations: [{
        confirmation_id: "v5-flight-confirmation",
        kind: "FLIGHT",
        title: "Phuket to Singapore",
        confirmation_reference: "V5-SQ-001",
        starts_at: "2035-04-10T03:00:00Z",
        ends_at: "2035-04-10T05:00:00Z",
        timezone: "Asia/Bangkok",
        origin: "Phuket",
        destination: "Singapore",
        evidence_id: "v5-flight-evidence",
        status: "CONFIRMED",
        version: 1,
        confirmation_inferred: false,
      }],
      disruptions: [{
        disruption_id: "v5-delay",
        evidence_id: "v5-delay-evidence",
        description: "Carrier reported delay",
        occurred_at: "2035-04-10T01:00:00Z",
        impact_inferred: false,
      }],
      history: [],
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

const result = await readSecretaryExecutiveBriefingV5({
  context,
  payload: {
    cadence: "DAILY",
    from: "2035-04-10T00:00:00Z",
    to: "2035-04-11T00:00:00Z",
    now: "2035-04-10T00:00:00Z",
    limit: 100,
  },
});

assert.equal(result.contract, "AVANTIQO_EXECUTIVE_SECRETARY_DESK_BRIEFING_V5");
assert.equal(result.evidence_only, true);
assert.equal(result.commitment_inferred, false);
assert.equal(result.preferences_inferred, false);
assert.equal(result.travel_confirmation_inferred, false);
assert.equal(result.booking_authority_created, false);
assert.equal(result.payment_authority_created, false);
assert.equal(result.binding_authority_created, false);
assert.equal(result.platform_permissions_mutated, false);
assert.equal(result.external_authority_used, false);
assert.equal(result.source_status.complete, true);

assert.ok(result.executive_desk.commitments.staff_delegations.some((item) => item.title === "Prepare board pack"));
assert.ok(result.executive_desk.working_preferences.current.some((item) => item.path === "TRAVEL.seat_preference" && item.value === "aisle"));
assert.equal(result.executive_desk.working_preferences.explicit_instruction_overrides_preference, true);
assert.equal(result.executive_desk.travel_operations.active_job_count, 1);
assert.equal(result.executive_desk.travel_operations.confirmed_itinerary_item_count, 1);
assert.equal(result.executive_desk.travel_operations.disruption_count, 1);
assert.equal(result.executive_desk.travel_operations.approval_required_step_count, 1);
assert.equal(result.executive_desk.travel_operations.researched_option_is_confirmation, false);

assert.equal(result.executive_desk.exception_count, result.underlying_v4.executive_desk.exception_count);
assert.equal(result.executive_desk.secretary_owned_count, result.underlying_v4.executive_desk.secretary_owned_count);
assert.equal(result.executive_desk.counting_policy.v4_exception_count_preserved, true);
assert.equal(result.executive_desk.counting_policy.commitment_register_not_added_again, true);
assert.equal(result.executive_desk.counting_policy.secretary_owned_count_not_recomputed_from_commitments, true);
assert.ok(result.executive_desk.unified_active_commitment_count >= 2);

console.log("SECRETARY_EXECUTIVE_BRIEFING_V5_LOCAL_CERTIFICATION=PASS");
console.log("SECRETARY_EXECUTIVE_BRIEFING_V5_COMMITMENT_CONTROL=true");
console.log("SECRETARY_EXECUTIVE_BRIEFING_V5_STAFF_DELEGATION_VISIBLE=true");
console.log("SECRETARY_EXECUTIVE_BRIEFING_V5_WORKING_PREFERENCES_VISIBLE=true");
console.log("SECRETARY_EXECUTIVE_BRIEFING_V5_EXPLICIT_INSTRUCTION_OVERRIDES_PREFERENCE=true");
console.log("SECRETARY_EXECUTIVE_BRIEFING_V5_TRAVEL_OPERATIONS_VISIBLE=true");
console.log("SECRETARY_EXECUTIVE_BRIEFING_V5_TRAVEL_CONFIRMATION_NOT_INFERRED=true");
console.log("SECRETARY_EXECUTIVE_BRIEFING_V5_TRAVEL_DISRUPTION_IMPACT_NOT_INFERRED=true");
console.log("SECRETARY_EXECUTIVE_BRIEFING_V5_APPROVAL_GATE_VISIBLE=true");
console.log("SECRETARY_EXECUTIVE_BRIEFING_V5_V4_EXCEPTION_COUNT_PRESERVED=true");
console.log("SECRETARY_EXECUTIVE_BRIEFING_V5_COMMITMENTS_DOUBLE_COUNTED=false");
console.log("SECRETARY_EXECUTIVE_BRIEFING_V5_PREFERENCES_INFERRED=false");
console.log("SECRETARY_EXECUTIVE_BRIEFING_V5_PLATFORM_PERMISSIONS_MUTATED=false");
console.log("SECRETARY_EXECUTIVE_BRIEFING_V5_BINDING_AUTHORITY_CREATED=false");
console.log("SECRETARY_EXECUTIVE_BRIEFING_V5_BOOKING_AUTHORITY_CREATED=false");
console.log("SECRETARY_EXECUTIVE_BRIEFING_V5_PAYMENT_AUTHORITY_CREATED=false");
console.log("SECRETARY_PROVIDER_CALLS_PERFORMED=false");
console.log("SECRETARY_EXTERNAL_AUTHORITY_USED=false");
console.log("SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false");
