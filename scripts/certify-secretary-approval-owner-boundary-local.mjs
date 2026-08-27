import assert from "node:assert/strict";

function required(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`SECRETARY_APPROVAL_OWNER_LOCAL_ENV_REQUIRED:${name}`);
  return value;
}

function assertLocalSupabase(urlValue) {
  const url = new URL(urlValue);
  if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(url.hostname)) {
    throw new Error("SECRETARY_APPROVAL_OWNER_LOCAL_REFUSED_NON_LOCAL_SUPABASE");
  }
}

async function one(result, label) {
  const resolved = await result;
  if (resolved.error) throw new Error(`${label}:${resolved.error.code || "UNKNOWN"}:${resolved.error.message || "ERROR"}`);
  return resolved.data || null;
}

const supabaseUrl = required("NEXT_PUBLIC_SUPABASE_URL");
required("SUPABASE_SERVICE_ROLE_KEY");
assertLocalSupabase(supabaseUrl);

const { supabaseAdmin } = await import("../lib/shared/supabase/admin.js");
const { approveSecretaryJobStep } = await import("../lib/operator/secretary/SecretaryJobApprovalRuntime.js");

let organizationId = null;
try {
  const organization = await one(
    supabaseAdmin.from("organizations").insert({ name: "Secretary Approval Owner Boundary Local Certification" }).select("id").single(),
    "SECRETARY_APPROVAL_OWNER_ORGANIZATION_INSERT_FAILED",
  );
  organizationId = organization.id;

  const owner = await one(
    supabaseAdmin.from("parties").insert({
      organization_id: organizationId,
      display_name: "Canonical Executive Owner",
      party_type: "PERSON",
      status: "ACTIVE",
      metadata: { local_certification: true },
    }).select("id").single(),
    "SECRETARY_APPROVAL_OWNER_PARTY_INSERT_FAILED",
  );
  const delegate = await one(
    supabaseAdmin.from("parties").insert({
      organization_id: organizationId,
      display_name: "Temporary Coverage Delegate",
      party_type: "PERSON",
      status: "ACTIVE",
      metadata: { local_certification: true },
    }).select("id").single(),
    "SECRETARY_APPROVAL_DELEGATE_PARTY_INSERT_FAILED",
  );

  const job = await one(
    supabaseAdmin.from("secretary_jobs").insert({
      organization_id: organizationId,
      requested_by_party_id: owner.id,
      source_kind: "MANUAL",
      objective: "Approve one binding payment step",
      success_criteria: [],
      status: "REVIEW_REQUIRED",
      autonomy_level: "EXECUTE_WITH_GATES",
      approval_policy: {},
      execution_plan: [],
      metadata: {
        local_certification: true,
        canonical_owner_party_id: owner.id,
        operational_assignee_party_id: delegate.id,
        secretary_coverage_applied: true,
        binding_authority_delegated: false,
        approval_authority_delegated: false,
      },
    }).select("*").single(),
    "SECRETARY_APPROVAL_OWNER_JOB_INSERT_FAILED",
  );

  const step = await one(
    supabaseAdmin.from("secretary_job_steps").insert({
      organization_id: organizationId,
      job_id: job.id,
      sequence_number: 1,
      action_type: "CREATE_TASK",
      instruction: "Create an internal task directing staff to make a payment of 1 THB under this exact approval.",
      status: "APPROVAL_REQUIRED",
      requires_approval: true,
      last_error: "SECRETARY_JOB_HIGH_AUTHORITY_ACTION_REQUIRES_APPROVAL",
      result: "SECRETARY_JOB_HIGH_AUTHORITY_ACTION_REQUIRES_APPROVAL",
      metadata: { local_certification: true, canonical_owner_party_id: owner.id },
    }).select("*").single(),
    "SECRETARY_APPROVAL_OWNER_STEP_INSERT_FAILED",
  );

  let delegateError = null;
  try {
    await approveSecretaryJobStep({
      context: { organizationId, actor: { partyId: delegate.id }, metadata: { partyId: delegate.id } },
      payload: { job_id: job.id, step_id: step.id },
    });
  } catch (error) {
    delegateError = String(error?.message || error);
  }
  assert.equal(delegateError, "SECRETARY_JOB_APPROVAL_CANONICAL_OWNER_REQUIRED");

  const afterDelegate = await one(
    supabaseAdmin.from("secretary_job_steps").select("*").eq("organization_id", organizationId).eq("id", step.id).single(),
    "SECRETARY_APPROVAL_OWNER_STEP_AFTER_DELEGATE_READ_FAILED",
  );
  assert.equal(afterDelegate.status, "APPROVAL_REQUIRED");
  assert.equal(Boolean(afterDelegate.metadata?.approval), false);

  const approved = await approveSecretaryJobStep({
    context: { organizationId, actor: { partyId: owner.id }, metadata: { partyId: owner.id } },
    payload: { job_id: job.id, step_id: step.id, approval_note: "Canonical owner exact-step approval" },
  });
  assert.equal(approved.status, "queued");
  assert.equal(approved.approval.approved_by_party_id, owner.id);
  assert.equal(approved.approval.canonical_owner_party_id, owner.id);
  assert.equal(approved.approval.coverage_authority_delegated, false);
  assert.equal(approved.approval.future_steps_authorized, false);
  assert.equal(approved.approval.authority_not_extended, true);

  console.log("SECRETARY_APPROVAL_OWNER_BOUNDARY_LOCAL_CERTIFICATION=PASS");
  console.log("SECRETARY_APPROVAL_CANONICAL_OWNER_REQUIRED=true");
  console.log("SECRETARY_APPROVAL_COVERAGE_DELEGATE_REJECTED=true");
  console.log("SECRETARY_APPROVAL_EXACT_OWNER_ACCEPTED=true");
  console.log("SECRETARY_APPROVAL_FUTURE_STEPS_AUTHORIZED=false");
  console.log("SECRETARY_APPROVAL_COVERAGE_AUTHORITY_DELEGATED=false");
  console.log("SECRETARY_APPROVAL_PLATFORM_PERMISSIONS_MUTATED=false");
  console.log("SECRETARY_EXTERNAL_AUTHORITY_USED=false");
  console.log("SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false");
} finally {
  if (organizationId) {
    const cleanup = await supabaseAdmin.from("organizations").delete().eq("id", organizationId);
    if (cleanup.error) console.error(`SECRETARY_APPROVAL_OWNER_LOCAL_CLEANUP_WARNING=${cleanup.error.code || "UNKNOWN"}`);
  }
}
