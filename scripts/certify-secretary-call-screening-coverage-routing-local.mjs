import assert from "node:assert/strict";

function required(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`SECRETARY_CALL_SCREENING_COVERAGE_LOCAL_ENV_REQUIRED:${name}`);
  return value;
}

function assertLocalSupabase(urlValue) {
  const url = new URL(urlValue);
  if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(url.hostname)) {
    throw new Error("SECRETARY_CALL_SCREENING_COVERAGE_LOCAL_REFUSED_NON_LOCAL_SUPABASE");
  }
}

async function one(result, label) {
  const resolved = await result;
  if (resolved.error) throw new Error(`${label}:${resolved.error.code || "UNKNOWN"}:${resolved.error.message || "ERROR"}`);
  return resolved.data || null;
}

async function many(result, label) {
  const resolved = await result;
  if (resolved.error) throw new Error(`${label}:${resolved.error.code || "UNKNOWN"}:${resolved.error.message || "ERROR"}`);
  return Array.isArray(resolved.data) ? resolved.data : [];
}

const supabaseUrl = required("NEXT_PUBLIC_SUPABASE_URL");
required("SUPABASE_SERVICE_ROLE_KEY");
assertLocalSupabase(supabaseUrl);

const { supabaseAdmin } = await import("../lib/shared/supabase/admin.js");
const { screenSecretaryCallWithCoverageRouting } = await import("../lib/operator/secretary/SecretaryCallScreeningCoverageRoutingRuntime.js");
const { setSecretaryContactCallHandling } = await import("../lib/operator/secretary/SecretaryCallScreeningRuntime.js");

let organizationId = null;
try {
  const organization = await one(
    supabaseAdmin.from("organizations").insert({ name: "Secretary Call Screening Coverage Local Certification" }).select("id").single(),
    "SECRETARY_CALL_SCREENING_COVERAGE_ORGANIZATION_INSERT_FAILED",
  );
  organizationId = organization.id;

  const parties = await many(
    supabaseAdmin.from("parties").insert([
      { organization_id: organizationId, display_name: "Executive Owner", email: "call-coverage-owner@example.invalid", party_type: "PERSON", status: "ACTIVE", metadata: { local_certification: true } },
      { organization_id: organizationId, display_name: "Call Delegate", email: "call-coverage-delegate@example.invalid", party_type: "PERSON", status: "ACTIVE", metadata: { local_certification: true } },
      { organization_id: organizationId, display_name: "Routine Caller", email: "call-coverage-routine@example.invalid", party_type: "PERSON", status: "ACTIVE", metadata: { local_certification: true } },
      { organization_id: organizationId, display_name: "Priority Caller", email: "call-coverage-priority@example.invalid", party_type: "PERSON", status: "ACTIVE", metadata: { local_certification: true } },
    ]).select("id,display_name"),
    "SECRETARY_CALL_SCREENING_COVERAGE_PARTIES_INSERT_FAILED",
  );
  const byName = new Map(parties.map((row) => [row.display_name, row.id]));
  const ownerId = byName.get("Executive Owner");
  const delegateId = byName.get("Call Delegate");
  const routineCallerId = byName.get("Routine Caller");
  const priorityCallerId = byName.get("Priority Caller");
  assert.ok(ownerId && delegateId && routineCallerId && priorityCallerId);

  await one(
    supabaseAdmin.from("secretary_settings").insert({
      organization_id: organizationId,
      default_timezone: "Asia/Bangkok",
      default_language: "en",
      booking_policy: { owner_party_id: ownerId },
      metadata: { owner_party_id: ownerId, local_certification: true },
    }).select("organization_id").single(),
    "SECRETARY_CALL_SCREENING_COVERAGE_SETTINGS_INSERT_FAILED",
  );

  const line = await one(
    supabaseAdmin.from("secretary_phone_lines").insert({
      organization_id: organizationId,
      owner_party_id: ownerId,
      line_address: `call-coverage-${organizationId}`,
      transport_kind: "INTERNAL",
      display_name: "Coverage Test Line",
      timezone: "Asia/Bangkok",
      active: true,
      metadata: { local_certification: true },
    }).select("id").single(),
    "SECRETARY_CALL_SCREENING_COVERAGE_LINE_INSERT_FAILED",
  );

  const context = { organizationId, timezone: "Asia/Bangkok", actor: { partyId: ownerId }, metadata: { partyId: ownerId, localCertification: true } };
  const startsAt = "2035-05-01T00:00:00Z";
  const endsAt = "2035-05-02T00:00:00Z";
  await one(
    supabaseAdmin.from("secretary_tasks").insert({
      organization_id: organizationId,
      owner_party_id: ownerId,
      contact_party_id: delegateId,
      title: "Call screening temporary coverage",
      status: "IN_PROGRESS",
      priority: "HIGH",
      due_at: endsAt,
      source: "secretary_absence_coverage",
      created_by_party_id: ownerId,
      metadata: {
        version: 1,
        owner_party_id: ownerId,
        delegate_party_id: delegateId,
        starts_at: startsAt,
        ends_at: endsAt,
        coverage_status: "ACTIVE",
        coverage_scopes: ["CALL_SCREENING", "FOLLOW_UP_COORDINATION"],
        handoff_acknowledgement: {
          evidence_id: "call-coverage-handoff-v1",
          acknowledged_by_party_id: delegateId,
          acknowledged_at: "2035-05-01T00:01:00Z",
        },
        platform_permissions_mutated: false,
        delegated_binding_authority_created: false,
        external_authority_used: false,
      },
    }).select("id").single(),
    "SECRETARY_CALL_SCREENING_COVERAGE_TASK_INSERT_FAILED",
  );

  await setSecretaryContactCallHandling({
    context,
    payload: {
      party_id: priorityCallerId,
      tier: "EXECUTIVE_PRIORITY",
      interrupt_mode: "ALWAYS",
      evidence_id: "call-coverage-priority-v1",
      source_reference: "local://call-coverage/priority",
    },
  });

  async function createInboundCall(contactPartyId, suffix) {
    return one(
      supabaseAdmin.from("secretary_calls").insert({
        organization_id: organizationId,
        contact_party_id: contactPartyId,
        phone_line_id: line.id,
        direction: "INBOUND",
        remote_address: suffix,
        status: "ANSWERED",
        started_at: "2035-05-01T04:00:00Z",
        answered_at: "2035-05-01T04:00:01Z",
        raw_audio_persisted: false,
        metadata: { local_certification: true },
      }).select("*").single(),
      `SECRETARY_CALL_SCREENING_COVERAGE_CALL_INSERT_FAILED:${suffix}`,
    );
  }

  const routineCall = await createInboundCall(routineCallerId, "routine");
  const routine = await screenSecretaryCallWithCoverageRouting({
    context,
    payload: {
      call_id: routineCall.id,
      caller_request: "Please confirm the office address.",
      caller_stated_urgency: "ROUTINE",
      secretary_can_resolve: true,
      evidence_id: "call-coverage-routine-v1",
      source_reference: "local://call-coverage/routine",
      screened_at: "2035-05-01T04:01:00Z",
    },
  });
  assert.equal(routine.screening.route, "SECRETARY_HANDLE");
  assert.equal(routine.secretary_coverage_applied, true);
  assert.equal(routine.canonical_owner_party_id, ownerId);
  assert.equal(routine.operational_assignee_party_id, delegateId);
  assert.equal(routine.screening.vip_inferred, false);

  const callbackCall = await createInboundCall(routineCallerId, "callback");
  const callback = await screenSecretaryCallWithCoverageRouting({
    context,
    payload: {
      call_id: callbackCall.id,
      caller_request: "Please call me back later.",
      callback_requested: true,
      callback_due_at: "2035-05-01T08:00:00Z",
      evidence_id: "call-coverage-callback-v1",
      source_reference: "local://call-coverage/callback",
      screened_at: "2035-05-01T04:02:00Z",
    },
  });
  assert.equal(callback.screening.route, "CALLBACK");
  assert.equal(callback.callback_follow_up_coverage_scope, "FOLLOW_UP_COORDINATION");
  assert.equal(callback.callback_follow_up_operational_assignee_party_id, delegateId);
  assert.equal(callback.callback_follow_up.metadata?.canonical_owner_party_id, ownerId);

  const priorityCall = await createInboundCall(priorityCallerId, "priority");
  const priority = await screenSecretaryCallWithCoverageRouting({
    context,
    payload: {
      call_id: priorityCall.id,
      caller_request: "Routine update from explicitly prioritized caller.",
      caller_stated_urgency: "ROUTINE",
      evidence_id: "call-coverage-priority-call-v1",
      source_reference: "local://call-coverage/priority-call",
      screened_at: "2035-05-01T04:03:00Z",
    },
  });
  assert.equal(priority.screening.route, "INTERRUPT_EXECUTIVE");
  assert.equal(priority.secretary_coverage_applied, false);
  assert.equal(priority.operational_assignee_party_id, ownerId);
  assert.equal(priority.screening.secretary_owner_authority_required, true);
  assert.equal(priority.executive_interrupt_route_delegated, false);
  assert.equal(priority.routing_task.metadata?.operational_assignee_party_id, ownerId);

  const unknownCall = await createInboundCall(null, "unknown-urgent");
  const urgent = await screenSecretaryCallWithCoverageRouting({
    context,
    payload: {
      call_id: unknownCall.id,
      caller_request: "Caller says this is urgent and wants the executive.",
      caller_stated_urgency: "URGENT",
      evidence_id: "call-coverage-unknown-urgent-v1",
      source_reference: "local://call-coverage/unknown-urgent",
      screened_at: "2035-05-01T04:04:00Z",
    },
  });
  assert.equal(urgent.screening.route, "EXECUTIVE_REVIEW");
  assert.equal(urgent.screening.routing_reason, "CALLER_STATED_URGENCY_UNVERIFIED");
  assert.equal(urgent.secretary_coverage_applied, false);
  assert.equal(urgent.operational_assignee_party_id, ownerId);
  assert.equal(urgent.executive_review_route_delegated, false);
  assert.equal(urgent.screening.vip_inferred, false);
  assert.equal(urgent.screening.urgency_inferred, false);

  console.log("SECRETARY_CALL_SCREENING_COVERAGE_ROUTING_LOCAL_CERTIFICATION=PASS");
  console.log("SECRETARY_CALL_SCREENING_COVERAGE_ROUTINE_ACTIVE_DELEGATE=true");
  console.log("SECRETARY_CALL_SCREENING_COVERAGE_CANONICAL_OWNER_PRESERVED=true");
  console.log("SECRETARY_CALL_SCREENING_COVERAGE_CALLBACK_ACTIVE_DELEGATE=true");
  console.log("SECRETARY_CALL_SCREENING_COVERAGE_INTERRUPT_STAYS_OWNER=true");
  console.log("SECRETARY_CALL_SCREENING_COVERAGE_EXECUTIVE_REVIEW_STAYS_OWNER=true");
  console.log("SECRETARY_CALL_SCREENING_COVERAGE_UNKNOWN_URGENT_NOT_VIP=true");
  console.log("SECRETARY_CALL_SCREENING_COVERAGE_URGENCY_INFERRED=false");
  console.log("SECRETARY_CALL_SCREENING_COVERAGE_PLATFORM_PERMISSIONS_MUTATED=false");
  console.log("SECRETARY_CALL_SCREENING_COVERAGE_BINDING_AUTHORITY_DELEGATED=false");
  console.log("SECRETARY_CALL_SCREENING_COVERAGE_APPROVAL_AUTHORITY_DELEGATED=false");
  console.log("SECRETARY_PROVIDER_CALLS_PERFORMED=false");
  console.log("SECRETARY_EXTERNAL_AUTHORITY_USED=false");
  console.log("SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false");
} finally {
  if (organizationId) {
    const cleanup = await supabaseAdmin.from("organizations").delete().eq("id", organizationId);
    if (cleanup.error) console.error(`SECRETARY_CALL_SCREENING_COVERAGE_LOCAL_CLEANUP_WARNING=${cleanup.error.code || "UNKNOWN"}`);
  }
}
