import assert from "node:assert/strict";

function required(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`SECRETARY_TRAVEL_LOCAL_ENV_REQUIRED:${name}`);
  return value;
}

function assertLocalSupabase(urlValue) {
  let url;
  try {
    url = new URL(urlValue);
  } catch {
    throw new Error("SECRETARY_TRAVEL_LOCAL_SUPABASE_URL_INVALID");
  }
  if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(url.hostname)) {
    throw new Error("SECRETARY_TRAVEL_LOCAL_REFUSED_NON_LOCAL_SUPABASE");
  }
}

async function one(result, label) {
  const resolved = await result;
  if (resolved.error) {
    throw new Error(`${label}:${resolved.error.code || "UNKNOWN"}:${resolved.error.message || "ERROR"}`);
  }
  return resolved.data || null;
}

const supabaseUrl = required("NEXT_PUBLIC_SUPABASE_URL");
required("SUPABASE_SERVICE_ROLE_KEY");
assertLocalSupabase(supabaseUrl);

const { supabaseAdmin } = await import("../lib/shared/supabase/admin.js");
const { delegateSecretaryTravelCoordination } = await import("../lib/operator/secretary/SecretaryTravelCoordinationRuntime.js");
const { secretaryJobInstructionRequiresHighAuthority } = await import("../lib/operator/secretary/SecretaryJobExecutionRuntime.js");
const { createSecretaryTravelCapability } = await import("../lib/platform/capabilities/createSecretaryTravelCapability.js");

let organizationId = null;

try {
  const organization = await one(
    supabaseAdmin
      .from("organizations")
      .insert({ name: "Secretary Travel Coordination Local Certification" })
      .select("id")
      .single(),
    "SECRETARY_TRAVEL_LOCAL_ORGANIZATION_INSERT_FAILED",
  );
  organizationId = organization.id;

  const actor = await one(
    supabaseAdmin
      .from("parties")
      .insert({
        organization_id: organizationId,
        display_name: "Local Secretary Travel Operator",
        party_type: "PERSON",
        status: "ACTIVE",
        metadata: { local_certification: true },
      })
      .select("id")
      .single(),
    "SECRETARY_TRAVEL_LOCAL_ACTOR_INSERT_FAILED",
  );

  const context = {
    organizationId,
    timezone: "Asia/Bangkok",
    actor: { partyId: actor.id },
    metadata: { partyId: actor.id, localCertification: true },
  };

  const delegated = await delegateSecretaryTravelCoordination({
    context,
    payload: {
      request: "Coordinate a business visit to Singapore and prepare the itinerary. Research current flight, hotel and airport-transfer options, but do not make any booking or payment without my exact approval.",
      origin: "Phuket, Thailand",
      destination: "Singapore",
      purpose: "Business meetings",
      depart_after: "2026-09-10T06:00:00+07:00",
      arrive_before: "2026-09-10T15:00:00+08:00",
      return_after: "2026-09-12T16:00:00+08:00",
      return_before: "2026-09-13T02:00:00+07:00",
      timezone: "Asia/Bangkok",
      lodging_required: true,
      local_transport_required: true,
      budget: { currency: "THB", guidance: 30000 },
      appointments: [{
        title: "Singapore partner meeting",
        starts_at: "2026-09-11T10:00:00+08:00",
        ends_at: "2026-09-11T11:30:00+08:00",
        timezone: "Asia/Singapore",
        location: "Singapore",
      }],
      metadata: { local_certification: true },
    },
  });

  assert.equal(delegated.status, "queued");
  assert.equal(delegated.secretary_owns_follow_through, true);
  assert.equal(delegated.travel_coordination, true);
  assert.equal(delegated.itinerary_store, "SECRETARY_JOB_AND_NATIVE_CALENDAR");
  assert.equal(delegated.external_booking_authority_created, false);
  assert.equal(delegated.payment_authority_created, false);
  assert.equal(delegated.external_authority_used, false);
  assert.equal(delegated.job.status, "QUEUED");
  assert.equal(delegated.job.autonomy_level, "EXECUTE_WITH_GATES");
  assert.equal(delegated.job.metadata.job_kind, "TRAVEL_COORDINATION");
  assert.equal(delegated.job.metadata.itinerary_store, "SECRETARY_JOB_AND_NATIVE_CALENDAR");
  assert.equal(delegated.job.metadata.external_booking_authority_created, false);
  assert.equal(delegated.job.metadata.payment_authority_created, false);
  assert.equal(delegated.job.approval_policy.travel_booking_requires_exact_step_approval, true);
  assert.equal(delegated.job.approval_policy.travel_payment_requires_exact_step_approval, true);
  assert.equal(delegated.job.approval_policy.travel_commercial_commitment_requires_exact_step_approval, true);
  assert.equal(delegated.job.approval_policy.budget_is_guidance_not_authority, true);

  assert.equal(secretaryJobInstructionRequiresHighAuthority("Research current Phuket to Singapore flight schedules and fares"), false);
  assert.equal(secretaryJobInstructionRequiresHighAuthority("Compare hotel room availability and rates near Marina Bay"), false);
  assert.equal(secretaryJobInstructionRequiresHighAuthority("Check airport transfer options and prices"), false);
  assert.equal(secretaryJobInstructionRequiresHighAuthority("Book the selected hotel room"), true);
  assert.equal(secretaryJobInstructionRequiresHighAuthority("Reserve the airport transfer"), true);
  assert.equal(secretaryJobInstructionRequiresHighAuthority("Buy the airline ticket"), true);
  assert.equal(secretaryJobInstructionRequiresHighAuthority("Accept the quoted hotel rate"), true);
  assert.equal(secretaryJobInstructionRequiresHighAuthority("Confirm the cancellation fee and availability only"), false);

  const capability = createSecretaryTravelCapability();
  assert.equal(capability.manifest.domain, "platform");
  assert.equal(capability.manifest.capability, "secretary_travel");
  assert.equal(capability.manifest.action, "coordinate");
  assert.equal(capability.manifest.operatorMode, "write");
  assert.equal(capability.manifest.operatorRequiresConfirmation, true);
  assert.equal(capability.manifest.contextScope, "organization");
  assert.equal(capability.authorize({ context }), true);

  console.log("SECRETARY_TRAVEL_COORDINATION_LOCAL_CERTIFICATION=PASS");
  console.log("SECRETARY_TRAVEL_DURABLE_JOB_INTAKE=true");
  console.log("SECRETARY_TRAVEL_ITINERARY_CANONICAL_STORE=true");
  console.log("SECRETARY_TRAVEL_BUDGET_IS_GUIDANCE_ONLY=true");
  console.log("SECRETARY_TRAVEL_RESEARCH_AUTONOMY=true");
  console.log("SECRETARY_TRAVEL_BOOKING_EXACT_STEP_APPROVAL_REQUIRED=true");
  console.log("SECRETARY_TRAVEL_PAYMENT_EXACT_STEP_APPROVAL_REQUIRED=true");
  console.log("SECRETARY_TRAVEL_RESERVATION_LANGUAGE_GATED=true");
  console.log("SECRETARY_TRAVEL_TICKET_PURCHASE_LANGUAGE_GATED=true");
  console.log("SECRETARY_PROVIDER_CALLS_PERFORMED=false");
  console.log("SECRETARY_EXTERNAL_AUTHORITY_USED=false");
  console.log("SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false");
} finally {
  if (organizationId) {
    await supabaseAdmin
      .from("organizations")
      .delete()
      .eq("id", organizationId);
  }
}
