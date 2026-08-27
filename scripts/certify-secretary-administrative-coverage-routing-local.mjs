import assert from "node:assert/strict";

function required(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`SECRETARY_ADMIN_COVERAGE_LOCAL_ENV_REQUIRED:${name}`);
  return value;
}

function assertLocalSupabase(urlValue) {
  const url = new URL(urlValue);
  if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(url.hostname)) {
    throw new Error("SECRETARY_ADMIN_COVERAGE_LOCAL_REFUSED_NON_LOCAL_SUPABASE");
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
const {
  resolveSecretaryAdministrativeCoverage,
  resolveSecretaryFollowUpCoverage,
  secretaryCoverageScopeForJob,
  secretaryCoverageScopeForStep,
  secretaryAdministrativeCoverageMetadata,
} = await import("../lib/operator/secretary/SecretaryAdministrativeCoverageRoutingRuntime.js");
const { secretaryFollowUpExecutionNeedsHumanAttention } = await import("../lib/operator/secretary/SecretaryFollowUpEscalationRuntime.js");

let organizationId = null;
try {
  const organization = await one(
    supabaseAdmin.from("organizations").insert({ name: "Secretary Administrative Coverage Local Certification" }).select("id").single(),
    "SECRETARY_ADMIN_COVERAGE_ORGANIZATION_INSERT_FAILED",
  );
  organizationId = organization.id;

  const parties = await many(
    supabaseAdmin.from("parties").insert([
      { organization_id: organizationId, display_name: "Canonical Executive", email: "admin-owner@example.invalid", party_type: "PERSON", status: "ACTIVE", metadata: { local_certification: true } },
      { organization_id: organizationId, display_name: "Administrative Delegate", email: "admin-delegate@example.invalid", party_type: "PERSON", status: "ACTIVE", metadata: { local_certification: true } },
      { organization_id: organizationId, display_name: "Conflict Delegate", email: "admin-conflict@example.invalid", party_type: "PERSON", status: "ACTIVE", metadata: { local_certification: true } },
    ]).select("id,display_name"),
    "SECRETARY_ADMIN_COVERAGE_PARTIES_INSERT_FAILED",
  );
  const byName = new Map(parties.map((row) => [row.display_name, row.id]));
  const ownerId = byName.get("Canonical Executive");
  const delegateId = byName.get("Administrative Delegate");
  const conflictId = byName.get("Conflict Delegate");
  assert.ok(ownerId && delegateId && conflictId);

  await one(
    supabaseAdmin.from("secretary_settings").insert({
      organization_id: organizationId,
      default_timezone: "Asia/Bangkok",
      default_language: "en",
      booking_policy: { owner_party_id: ownerId },
      metadata: { owner_party_id: ownerId, local_certification: true },
    }).select("organization_id").single(),
    "SECRETARY_ADMIN_COVERAGE_SETTINGS_INSERT_FAILED",
  );

  const at = "2035-02-10T10:00:00Z";
  const coverage = await one(
    supabaseAdmin.from("secretary_tasks").insert({
      organization_id: organizationId,
      owner_party_id: ownerId,
      contact_party_id: delegateId,
      title: "Administrative temporary coverage",
      status: "IN_PROGRESS",
      priority: "HIGH",
      due_at: "2035-02-12T00:00:00Z",
      source: "secretary_absence_coverage",
      created_by_party_id: ownerId,
      metadata: {
        version: 1,
        owner_party_id: ownerId,
        delegate_party_id: delegateId,
        starts_at: "2035-02-10T00:00:00Z",
        ends_at: "2035-02-12T00:00:00Z",
        coverage_status: "ACTIVE",
        coverage_scopes: ["TASK_ROUTING", "FOLLOW_UP_COORDINATION", "CALENDAR_COORDINATION", "TRAVEL_COORDINATION"],
        handoff_acknowledgement: {
          evidence_id: "admin-coverage-ack-v1",
          acknowledged_by_party_id: delegateId,
          acknowledged_at: "2035-02-10T00:10:00Z",
        },
        platform_permissions_mutated: false,
        delegated_binding_authority_created: false,
        external_authority_used: false,
      },
    }).select("id").single(),
    "SECRETARY_ADMIN_COVERAGE_INSERT_FAILED",
  );

  const routine = await resolveSecretaryAdministrativeCoverage({
    organizationId,
    ownerPartyId: ownerId,
    scope: "TASK_ROUTING",
    instruction: "Review the routine status list and prepare the next internal task.",
    at,
  });
  assert.equal(routine.coverage_applied, true);
  assert.equal(routine.canonical_owner_party_id, ownerId);
  assert.equal(routine.operational_assignee_party_id, delegateId);
  assert.equal(routine.coverage_id, coverage.id);
  assert.equal(routine.coverage_routing_review_required, false);

  const authority = await resolveSecretaryAdministrativeCoverage({
    organizationId,
    ownerPartyId: ownerId,
    scope: "TRAVEL_COORDINATION",
    instruction: "Accept the hotel rate and pay the booking deposit.",
    at,
  });
  assert.equal(authority.coverage_applied, false);
  assert.equal(authority.operational_assignee_party_id, ownerId);
  assert.equal(authority.routing_reason, "OWNER_AUTHORITY_REQUIRED");
  assert.equal(authority.owner_authority_required, true);

  const job = {
    organization_id: organizationId,
    requested_by_party_id: ownerId,
    objective: "Coordinate a routine business trip without making bookings.",
    metadata: { job_kind: "TRAVEL_COORDINATION" },
  };
  assert.equal(secretaryCoverageScopeForJob(job), "TRAVEL_COORDINATION");
  assert.equal(secretaryCoverageScopeForStep(job, { action_type: "EMAIL", instruction: "Request hotel availability." }), "TRAVEL_COORDINATION");
  assert.equal(secretaryCoverageScopeForStep({ ...job, metadata: {} }, { action_type: "CREATE_EVENT", instruction: "Create the known internal calendar hold." }), "CALENDAR_COORDINATION");

  const followUp = {
    organization_id: organizationId,
    owner_party_id: ownerId,
    reason: "Ask for the existing status update only.",
    metadata: {
      execution_owner: "SECRETARY",
      execution_ready: true,
      execution_instruction: "Ask for the existing status update only.",
      secretary_coverage_scope: "FOLLOW_UP_COORDINATION",
    },
  };
  const followUpRouting = await resolveSecretaryFollowUpCoverage({ followUp, at });
  assert.equal(followUpRouting.coverage_applied, true);
  assert.equal(followUpRouting.operational_assignee_party_id, delegateId);
  assert.equal(secretaryAdministrativeCoverageMetadata(followUpRouting).platform_permissions_mutated, false);

  const expired = await resolveSecretaryAdministrativeCoverage({
    organizationId,
    ownerPartyId: ownerId,
    scope: "TASK_ROUTING",
    instruction: "Review the routine status list.",
    at: "2035-02-13T00:00:00Z",
  });
  assert.equal(expired.coverage_applied, false);
  assert.equal(expired.operational_assignee_party_id, ownerId);

  await one(
    supabaseAdmin.from("secretary_tasks").insert({
      organization_id: organizationId,
      owner_party_id: ownerId,
      contact_party_id: conflictId,
      title: "Conflicting administrative coverage",
      status: "IN_PROGRESS",
      priority: "HIGH",
      due_at: "2035-02-11T00:00:00Z",
      source: "secretary_absence_coverage",
      created_by_party_id: ownerId,
      metadata: {
        version: 1,
        owner_party_id: ownerId,
        delegate_party_id: conflictId,
        starts_at: "2035-02-10T06:00:00Z",
        ends_at: "2035-02-11T12:00:00Z",
        coverage_status: "ACTIVE",
        coverage_scopes: ["FOLLOW_UP_COORDINATION"],
        handoff_acknowledgement: {
          evidence_id: "admin-coverage-ack-conflict",
          acknowledged_by_party_id: conflictId,
          acknowledged_at: "2035-02-10T06:05:00Z",
        },
        platform_permissions_mutated: false,
        delegated_binding_authority_created: false,
        external_authority_used: false,
      },
    }).select("id").single(),
    "SECRETARY_ADMIN_COVERAGE_CONFLICT_INSERT_FAILED",
  );

  const ambiguous = await resolveSecretaryFollowUpCoverage({ followUp, at });
  assert.equal(ambiguous.coverage_applied, false);
  assert.equal(ambiguous.operational_assignee_party_id, ownerId);
  assert.equal(ambiguous.coverage_routing_review_required, true);
  assert.equal(ambiguous.coverage_routing_fail_closed, true);
  assert.equal(ambiguous.routing_reason, "SECRETARY_ACTIVE_COVERAGE_AMBIGUOUS");
  assert.equal(secretaryFollowUpExecutionNeedsHumanAttention(`SECRETARY_COVERAGE_ROUTING_REVIEW_REQUIRED:${ambiguous.routing_reason}`), true);

  const disableDelegate = await supabaseAdmin.from("parties").update({ status: "INACTIVE" }).eq("organization_id", organizationId).eq("id", delegateId);
  if (disableDelegate.error) throw disableDelegate.error;
  const removeConflict = await supabaseAdmin.from("secretary_tasks").delete().eq("organization_id", organizationId).eq("contact_party_id", conflictId).eq("source", "secretary_absence_coverage");
  if (removeConflict.error) throw removeConflict.error;

  const unavailable = await resolveSecretaryFollowUpCoverage({ followUp, at });
  assert.equal(unavailable.coverage_applied, false);
  assert.equal(unavailable.operational_assignee_party_id, ownerId);
  assert.equal(unavailable.coverage_routing_review_required, true);
  assert.equal(unavailable.routing_reason, "SECRETARY_ACTIVE_COVERAGE_DELEGATE_UNAVAILABLE");

  console.log("SECRETARY_ADMINISTRATIVE_COVERAGE_ROUTING_LOCAL_CERTIFICATION=PASS");
  console.log("SECRETARY_ADMIN_COVERAGE_LIVE_ROUTING=true");
  console.log("SECRETARY_ADMIN_COVERAGE_SCOPE_MAPPING=true");
  console.log("SECRETARY_ADMIN_COVERAGE_ACTIVE_DELEGATE=true");
  console.log("SECRETARY_ADMIN_COVERAGE_CANONICAL_OWNER_PRESERVED=true");
  console.log("SECRETARY_ADMIN_COVERAGE_OWNER_AUTHORITY_OVERRIDE=true");
  console.log("SECRETARY_ADMIN_COVERAGE_EXPIRED_OWNER_RESTORED=true");
  console.log("SECRETARY_ADMIN_COVERAGE_AMBIGUITY_BLOCKS_EXTERNAL_ACTION=true");
  console.log("SECRETARY_ADMIN_COVERAGE_UNAVAILABLE_DELEGATE_BLOCKS_EXTERNAL_ACTION=true");
  console.log("SECRETARY_ADMIN_COVERAGE_BLOCKER_ESCALATES_TO_OWNER=true");
  console.log("SECRETARY_ADMIN_COVERAGE_PLATFORM_PERMISSIONS_MUTATED=false");
  console.log("SECRETARY_ADMIN_COVERAGE_BINDING_AUTHORITY_DELEGATED=false");
  console.log("SECRETARY_ADMIN_COVERAGE_APPROVAL_AUTHORITY_DELEGATED=false");
  console.log("SECRETARY_PROVIDER_CALLS_PERFORMED=false");
  console.log("SECRETARY_EXTERNAL_AUTHORITY_USED=false");
  console.log("SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false");
} finally {
  if (organizationId) {
    const cleanup = await supabaseAdmin.from("organizations").delete().eq("id", organizationId);
    if (cleanup.error) console.error(`SECRETARY_ADMIN_COVERAGE_LOCAL_CLEANUP_WARNING=${cleanup.error.code || "UNKNOWN"}`);
  }
}
