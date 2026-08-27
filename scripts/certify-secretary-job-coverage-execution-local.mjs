import assert from "node:assert/strict";

function required(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`SECRETARY_JOB_COVERAGE_EXECUTION_LOCAL_ENV_REQUIRED:${name}`);
  return value;
}

function assertLocalSupabase(urlValue) {
  const url = new URL(urlValue);
  if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(url.hostname)) {
    throw new Error("SECRETARY_JOB_COVERAGE_EXECUTION_LOCAL_REFUSED_NON_LOCAL_SUPABASE");
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
  resolveSecretaryJobStepExecutionCoverage,
  secretaryJobExecutionCoverageMetadata,
  secretaryJobExactApprovalOwnedByCanonicalOwner,
} = await import("../lib/operator/secretary/SecretaryJobCoverageExecutionRuntime.js");

let organizationId = null;
try {
  const organization = await one(
    supabaseAdmin.from("organizations").insert({ name: "Secretary Job Coverage Execution Local Certification" }).select("id").single(),
    "SECRETARY_JOB_COVERAGE_EXECUTION_ORGANIZATION_INSERT_FAILED",
  );
  organizationId = organization.id;

  const parties = await many(
    supabaseAdmin.from("parties").insert([
      { organization_id: organizationId, display_name: "Job Coverage Owner", party_type: "PERSON", status: "ACTIVE", metadata: { local_certification: true } },
      { organization_id: organizationId, display_name: "Job Coverage Delegate", party_type: "PERSON", status: "ACTIVE", metadata: { local_certification: true } },
      { organization_id: organizationId, display_name: "Explicit Task Target", party_type: "PERSON", status: "ACTIVE", metadata: { local_certification: true } },
    ]).select("id,display_name"),
    "SECRETARY_JOB_COVERAGE_EXECUTION_PARTIES_INSERT_FAILED",
  );
  const byName = new Map(parties.map((row) => [row.display_name, row.id]));
  const ownerId = byName.get("Job Coverage Owner");
  const delegateId = byName.get("Job Coverage Delegate");
  const targetId = byName.get("Explicit Task Target");
  assert.ok(ownerId && delegateId && targetId);

  await one(
    supabaseAdmin.from("secretary_settings").insert({
      organization_id: organizationId,
      default_timezone: "Asia/Bangkok",
      default_language: "en",
      booking_policy: { owner_party_id: ownerId },
      metadata: { owner_party_id: ownerId, local_certification: true },
    }).select("organization_id").single(),
    "SECRETARY_JOB_COVERAGE_EXECUTION_SETTINGS_INSERT_FAILED",
  );

  await one(
    supabaseAdmin.from("secretary_tasks").insert({
      organization_id: organizationId,
      owner_party_id: ownerId,
      contact_party_id: delegateId,
      title: "Job execution temporary coverage",
      status: "IN_PROGRESS",
      priority: "HIGH",
      due_at: "2035-04-12T00:00:00Z",
      source: "secretary_absence_coverage",
      created_by_party_id: ownerId,
      metadata: {
        version: 1,
        owner_party_id: ownerId,
        delegate_party_id: delegateId,
        starts_at: "2035-04-10T00:00:00Z",
        ends_at: "2035-04-12T00:00:00Z",
        coverage_status: "ACTIVE",
        coverage_scopes: ["TASK_ROUTING", "FOLLOW_UP_COORDINATION", "CALENDAR_COORDINATION"],
        handoff_acknowledgement: {
          evidence_id: "job-execution-coverage-ack-v1",
          acknowledged_by_party_id: delegateId,
          acknowledged_at: "2035-04-10T00:10:00Z",
        },
        platform_permissions_mutated: false,
        delegated_binding_authority_created: false,
        external_authority_used: false,
      },
    }).select("id").single(),
    "SECRETARY_JOB_COVERAGE_EXECUTION_COVERAGE_INSERT_FAILED",
  );

  const at = "2035-04-10T10:00:00Z";
  const baseJob = {
    id: "job-local-cert",
    organization_id: organizationId,
    requested_by_party_id: ownerId,
    objective: "Coordinate routine internal Secretary work.",
    metadata: { canonical_owner_party_id: ownerId },
  };

  const routineStep = {
    id: "step-routine",
    action_type: "CREATE_TASK",
    instruction: "Create the routine internal status task.",
    target_party_id: null,
    requires_approval: false,
    status: "PENDING",
    metadata: {},
  };
  const routine = await resolveSecretaryJobStepExecutionCoverage({ job: baseJob, step: routineStep, at });
  assert.equal(routine.coverage_applied, true);
  assert.equal(routine.canonical_owner_party_id, ownerId);
  assert.equal(routine.operational_assignee_party_id, delegateId);
  assert.equal(routine.execution_actor_party_id, delegateId);
  assert.equal(routine.artifact_owner_party_id, ownerId);

  const explicitStep = {
    ...routineStep,
    id: "step-explicit",
    target_party_id: targetId,
    instruction: "Create the routine task explicitly assigned to the selected staff member.",
  };
  const explicit = await resolveSecretaryJobStepExecutionCoverage({ job: baseJob, step: explicitStep, at });
  assert.equal(explicit.coverage_applied, true);
  assert.equal(explicit.execution_actor_party_id, delegateId);
  assert.equal(explicit.artifact_owner_party_id, targetId);
  assert.equal(explicit.explicit_target_assignment_preserved, true);

  const calendarStep = {
    id: "step-calendar",
    action_type: "CREATE_EVENT",
    instruction: "Create the already agreed internal calendar hold.",
    target_party_id: null,
    requires_approval: false,
    status: "PENDING",
    metadata: {},
  };
  const calendar = await resolveSecretaryJobStepExecutionCoverage({ job: baseJob, step: calendarStep, at });
  assert.equal(calendar.scope, "CALENDAR_COORDINATION");
  assert.equal(calendar.coverage_applied, true);
  assert.equal(calendar.execution_actor_party_id, delegateId);
  assert.equal(calendar.artifact_owner_party_id, ownerId);

  const highAuthorityStep = {
    id: "step-authority",
    action_type: "CREATE_TASK",
    instruction: "Create the exact approved task directing payment of 1 THB.",
    target_party_id: null,
    requires_approval: false,
    status: "PENDING",
    metadata: {
      approval: {
        kind: "EXPLICIT_STEP_APPROVAL",
        scope: "THIS_STEP_ONLY",
        granted: true,
        approved_job_id: baseJob.id,
        approved_step_id: "step-authority",
        approved_action_type: "CREATE_TASK",
        approved_instruction: "Create the exact approved task directing payment of 1 THB.",
        approved_by_party_id: ownerId,
        future_steps_authorized: false,
        authority_not_extended: true,
      },
    },
  };
  const authority = await resolveSecretaryJobStepExecutionCoverage({
    job: baseJob,
    step: highAuthorityStep,
    at,
    highAuthority: true,
  });
  assert.equal(authority.coverage_applied, false);
  assert.equal(authority.execution_actor_party_id, ownerId);
  assert.equal(authority.owner_authority_required, true);
  assert.equal(secretaryJobExactApprovalOwnedByCanonicalOwner(baseJob, highAuthorityStep), true);

  const forged = {
    ...highAuthorityStep,
    metadata: {
      approval: {
        ...highAuthorityStep.metadata.approval,
        approved_by_party_id: delegateId,
      },
    },
  };
  assert.equal(secretaryJobExactApprovalOwnedByCanonicalOwner(baseJob, forged), false);

  const metadata = secretaryJobExecutionCoverageMetadata(routine);
  assert.equal(metadata.canonical_owner_party_id, ownerId);
  assert.equal(metadata.operational_assignee_party_id, delegateId);
  assert.equal(metadata.platform_permissions_mutated, false);
  assert.equal(metadata.binding_authority_delegated, false);
  assert.equal(metadata.approval_authority_delegated, false);
  assert.equal(metadata.external_authority_used, false);

  console.log("SECRETARY_JOB_COVERAGE_EXECUTION_LOCAL_CERTIFICATION=PASS");
  console.log("SECRETARY_JOB_COVERAGE_EXECUTION_ROUTINE_DELEGATE=true");
  console.log("SECRETARY_JOB_COVERAGE_EXECUTION_CANONICAL_OWNER_PRESERVED=true");
  console.log("SECRETARY_JOB_COVERAGE_EXECUTION_EXPLICIT_TARGET_PRESERVED=true");
  console.log("SECRETARY_JOB_COVERAGE_EXECUTION_CALENDAR_DELEGATE=true");
  console.log("SECRETARY_JOB_COVERAGE_EXECUTION_HIGH_AUTHORITY_OWNER=true");
  console.log("SECRETARY_JOB_COVERAGE_EXECUTION_FORGED_DELEGATE_APPROVAL_REJECTED=true");
  console.log("SECRETARY_JOB_COVERAGE_EXECUTION_PLATFORM_PERMISSIONS_MUTATED=false");
  console.log("SECRETARY_JOB_COVERAGE_EXECUTION_BINDING_AUTHORITY_DELEGATED=false");
  console.log("SECRETARY_JOB_COVERAGE_EXECUTION_APPROVAL_AUTHORITY_DELEGATED=false");
  console.log("SECRETARY_PROVIDER_CALLS_PERFORMED=false");
  console.log("SECRETARY_EXTERNAL_AUTHORITY_USED=false");
  console.log("SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false");
} finally {
  if (organizationId) {
    const cleanup = await supabaseAdmin.from("organizations").delete().eq("id", organizationId);
    if (cleanup.error) console.error(`SECRETARY_JOB_COVERAGE_EXECUTION_LOCAL_CLEANUP_WARNING=${cleanup.error.code || "UNKNOWN"}`);
  }
}
