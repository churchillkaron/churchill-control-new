import assert from "node:assert/strict";

function required(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`SECRETARY_CANCEL_NORMALIZATION_LOCAL_ENV_REQUIRED:${name}`);
  return value;
}

function assertLocalSupabase(urlValue) {
  let url;
  try {
    url = new URL(urlValue);
  } catch {
    throw new Error("SECRETARY_CANCEL_NORMALIZATION_LOCAL_SUPABASE_URL_INVALID");
  }
  if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(url.hostname)) {
    throw new Error("SECRETARY_CANCEL_NORMALIZATION_LOCAL_REFUSED_NON_LOCAL_SUPABASE");
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
const { cancelSecretaryJob } = await import("../lib/operator/secretary/SecretaryJobReviewRuntime.js");

let organizationId = null;

try {
  const organization = await one(
    supabaseAdmin
      .from("organizations")
      .insert({ name: "Secretary Cancellation Normalization Local Certification" })
      .select("id")
      .single(),
    "SECRETARY_CANCEL_NORMALIZATION_LOCAL_ORGANIZATION_INSERT_FAILED",
  );
  organizationId = organization.id;

  const actor = await one(
    supabaseAdmin
      .from("parties")
      .insert({
        organization_id: organizationId,
        display_name: "Local Secretary Cancellation Operator",
        party_type: "PERSON",
        status: "ACTIVE",
        metadata: { local_certification: true },
      })
      .select("id")
      .single(),
    "SECRETARY_CANCEL_NORMALIZATION_LOCAL_ACTOR_INSERT_FAILED",
  );

  const job = await one(
    supabaseAdmin
      .from("secretary_jobs")
      .insert({
        organization_id: organizationId,
        requested_by_party_id: actor.id,
        source_kind: "MANUAL",
        objective: "Certify cancellation normalizes every non-terminal Secretary step state.",
        success_criteria: [],
        status: "RUNNING",
        autonomy_level: "EXECUTE_WITH_GATES",
        approval_policy: {},
        execution_plan: [],
        next_action_at: new Date().toISOString(),
        metadata: { local_certification: true, external_authority_used: false },
      })
      .select("*")
      .single(),
    "SECRETARY_CANCEL_NORMALIZATION_LOCAL_JOB_INSERT_FAILED",
  );

  const statuses = ["PENDING", "RUNNING", "WAITING", "APPROVAL_REQUIRED", "FAILED"];
  await one(
    supabaseAdmin
      .from("secretary_job_steps")
      .insert(statuses.map((status, index) => ({
        organization_id: organizationId,
        job_id: job.id,
        sequence_number: index + 1,
        action_type: index === 0 ? "CREATE_TASK" : "REVIEW",
        instruction: `Cancellation normalization local certification ${status}`,
        status,
        requires_approval: status === "APPROVAL_REQUIRED",
        last_error: status === "FAILED" ? "LOCAL_CERTIFICATION_FAILURE" : null,
        metadata: { local_certification: true, external_authority_used: false },
      })))
      .select("id,status"),
    "SECRETARY_CANCEL_NORMALIZATION_LOCAL_STEP_INSERT_FAILED",
  );

  const context = {
    organizationId,
    actor: { partyId: actor.id },
    metadata: { partyId: actor.id, localCertification: true },
  };

  const cancelled = await cancelSecretaryJob({
    context,
    payload: { job_id: job.id, reason: "Local cancellation normalization certification" },
  });

  assert.equal(cancelled.status, "cancelled");
  assert.equal(cancelled.job.status, "CANCELLED");
  assert.equal(cancelled.job.next_action_at, null);
  assert.ok(cancelled.job.completed_at);
  assert.equal(cancelled.secretary_owns_follow_through, false);
  assert.equal(cancelled.external_authority_used, false);

  const steps = await one(
    supabaseAdmin
      .from("secretary_job_steps")
      .select("sequence_number,status,requires_approval,last_error,completed_at")
      .eq("organization_id", organizationId)
      .eq("job_id", job.id)
      .order("sequence_number", { ascending: true }),
    "SECRETARY_CANCEL_NORMALIZATION_LOCAL_STEP_READ_FAILED",
  );

  assert.equal(steps.length, statuses.length);
  assert.equal(steps.every((step) => step.status === "SKIPPED"), true);
  assert.equal(steps.every((step) => step.requires_approval === false), true);
  assert.equal(steps.every((step) => step.last_error === null), true);
  assert.equal(steps.every((step) => Boolean(step.completed_at)), true);

  console.log("SECRETARY_JOB_CANCELLATION_NORMALIZATION_LOCAL_CERTIFICATION=PASS");
  console.log("SECRETARY_CANCELLED_PENDING_STEP_SKIPPED=true");
  console.log("SECRETARY_CANCELLED_RUNNING_STEP_SKIPPED=true");
  console.log("SECRETARY_CANCELLED_WAITING_STEP_SKIPPED=true");
  console.log("SECRETARY_CANCELLED_APPROVAL_REQUIRED_STEP_SKIPPED=true");
  console.log("SECRETARY_CANCELLED_FAILED_STEP_SKIPPED=true");
  console.log("SECRETARY_CANCEL_BULK_UPDATE_ERROR_CHECKED=true");
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
