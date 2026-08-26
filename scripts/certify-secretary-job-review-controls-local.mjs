import assert from "node:assert/strict";

function required(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`SECRETARY_REVIEW_LOCAL_ENV_REQUIRED:${name}`);
  return value;
}

function assertLocalSupabase(urlValue) {
  let url;
  try {
    url = new URL(urlValue);
  } catch {
    throw new Error("SECRETARY_REVIEW_LOCAL_SUPABASE_URL_INVALID");
  }
  if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(url.hostname)) {
    throw new Error("SECRETARY_REVIEW_LOCAL_REFUSED_NON_LOCAL_SUPABASE");
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
const {
  delegateSecretaryJob,
  listSecretaryJobs,
  readSecretaryJob,
} = await import("../lib/operator/secretary/SecretaryJobIntakeRuntime.js");
const {
  rejectSecretaryJobStep,
  reviseSecretaryJobStep,
  cancelSecretaryJob,
} = await import("../lib/operator/secretary/SecretaryJobReviewRuntime.js");
const { processSecretaryJob } = await import("../lib/operator/secretary/SecretaryJobExecutionRuntime.js");

let organizationId = null;

async function createReviewJob({ actorPartyId, instruction, metadata = {} }) {
  const job = await one(
    supabaseAdmin
      .from("secretary_jobs")
      .insert({
        organization_id: organizationId,
        requested_by_party_id: actorPartyId,
        source_kind: "MANUAL",
        objective: "Local Secretary review-control certification",
        success_criteria: [],
        status: "REVIEW_REQUIRED",
        autonomy_level: "EXECUTE_WITH_GATES",
        approval_policy: {},
        execution_plan: [],
        next_action_at: null,
        metadata: { local_certification: true, external_authority_used: false },
      })
      .select("*")
      .single(),
    "SECRETARY_REVIEW_LOCAL_JOB_INSERT_FAILED",
  );

  const steps = await one(
    supabaseAdmin
      .from("secretary_job_steps")
      .insert([
        {
          organization_id: organizationId,
          job_id: job.id,
          sequence_number: 1,
          action_type: "CREATE_TASK",
          instruction,
          status: "APPROVAL_REQUIRED",
          requires_approval: true,
          last_error: "SECRETARY_JOB_HIGH_AUTHORITY_ACTION_REQUIRES_APPROVAL",
          result: "SECRETARY_JOB_HIGH_AUTHORITY_ACTION_REQUIRES_APPROVAL",
          metadata: {
            local_certification: true,
            external_authority_used: false,
            ...metadata,
          },
        },
        {
          organization_id: organizationId,
          job_id: job.id,
          sequence_number: 2,
          action_type: "REVIEW",
          instruction: "Stop after the local review-control certification step so no provider-backed summary is requested.",
          status: "PENDING",
          requires_approval: false,
          metadata: { local_certification: true, external_authority_used: false },
        },
      ])
      .select("*"),
    "SECRETARY_REVIEW_LOCAL_STEP_INSERT_FAILED",
  );

  return { job, first: steps[0], stop: steps[1] };
}

try {
  const organization = await one(
    supabaseAdmin
      .from("organizations")
      .insert({ name: "Secretary Review Controls Local Certification" })
      .select("id")
      .single(),
    "SECRETARY_REVIEW_LOCAL_ORGANIZATION_INSERT_FAILED",
  );
  organizationId = organization.id;

  const actor = await one(
    supabaseAdmin
      .from("parties")
      .insert({
        organization_id: organizationId,
        display_name: "Local Secretary Review Operator",
        party_type: "PERSON",
        status: "ACTIVE",
        metadata: { local_certification: true },
      })
      .select("id")
      .single(),
    "SECRETARY_REVIEW_LOCAL_ACTOR_INSERT_FAILED",
  );

  const context = {
    organizationId,
    actor: { partyId: actor.id },
    metadata: { partyId: actor.id, localCertification: true },
  };

  const delegated = await delegateSecretaryJob({
    context,
    payload: {
      objective: "Maintain a durable internal Secretary job for local intake certification.",
      autonomy_level: "EXECUTE_WITH_GATES",
      metadata: { local_certification: true },
    },
  });
  assert.equal(delegated.status, "queued");
  assert.equal(delegated.job.status, "QUEUED");
  assert.ok(delegated.job.id);

  const staleWorkerJob = { ...delegated.job };

  const listed = await listSecretaryJobs({ context, payload: { limit: 100 } });
  assert.equal(listed.status, "completed");
  assert.equal(listed.jobs.some((row) => row.id === delegated.job.id), true);

  const read = await readSecretaryJob({ context, payload: { job_id: delegated.job.id } });
  assert.equal(read.job.id, delegated.job.id);
  assert.equal(Array.isArray(read.steps), true);

  await one(
    supabaseAdmin
      .from("secretary_job_steps")
      .insert([
        {
          organization_id: organizationId,
          job_id: delegated.job.id,
          sequence_number: 1,
          action_type: "CREATE_TASK",
          instruction: "Create an internal task that must never run after job cancellation.",
          status: "PENDING",
          requires_approval: false,
          metadata: { local_certification: true, external_authority_used: false },
        },
        {
          organization_id: organizationId,
          job_id: delegated.job.id,
          sequence_number: 2,
          action_type: "REVIEW",
          instruction: "Pending review step that must be skipped when the job is cancelled.",
          status: "APPROVAL_REQUIRED",
          requires_approval: true,
          metadata: { local_certification: true, external_authority_used: false },
        },
      ])
      .select("*"),
    "SECRETARY_REVIEW_LOCAL_CANCEL_STEP_INSERT_FAILED",
  );

  const cancelled = await cancelSecretaryJob({
    context,
    payload: { job_id: delegated.job.id, reason: "Local certification cancellation" },
  });
  assert.equal(cancelled.status, "cancelled");
  assert.equal(cancelled.job.status, "CANCELLED");
  assert.equal(cancelled.secretary_owns_follow_through, false);
  assert.equal(cancelled.external_authority_used, false);

  const staleWorkerOutcome = await processSecretaryJob(staleWorkerJob);
  assert.equal(staleWorkerOutcome.status, "cancelled");
  assert.equal(staleWorkerOutcome.job.status, "CANCELLED");
  assert.equal(staleWorkerOutcome.secretary_owns_follow_through, false);

  const cancelledAfterStaleWorker = await one(
    supabaseAdmin
      .from("secretary_jobs")
      .select("status,next_action_at,completed_at")
      .eq("organization_id", organizationId)
      .eq("id", delegated.job.id)
      .single(),
    "SECRETARY_REVIEW_LOCAL_CANCELLED_JOB_READ_FAILED",
  );
  assert.equal(cancelledAfterStaleWorker.status, "CANCELLED");
  assert.equal(cancelledAfterStaleWorker.next_action_at, null);
  assert.ok(cancelledAfterStaleWorker.completed_at);

  const cancelledSteps = await one(
    supabaseAdmin
      .from("secretary_job_steps")
      .select("status,requires_approval")
      .eq("organization_id", organizationId)
      .eq("job_id", delegated.job.id)
      .order("sequence_number", { ascending: true }),
    "SECRETARY_REVIEW_LOCAL_CANCEL_STEP_READ_FAILED",
  );
  assert.equal(cancelledSteps.length, 2);
  assert.equal(cancelledSteps.every((row) => row.status === "SKIPPED"), true);
  assert.equal(cancelledSteps.every((row) => row.requires_approval === false), true);

  const cancelledTask = await one(
    supabaseAdmin
      .from("secretary_tasks")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("metadata->>secretary_job_id", delegated.job.id)
      .maybeSingle(),
    "SECRETARY_REVIEW_LOCAL_CANCELLED_TASK_READ_FAILED",
  );
  assert.equal(cancelledTask, null, "SECRETARY_REVIEW_LOCAL_STALE_WORKER_EXECUTED_CANCELLED_JOB");

  const rejectedCase = await createReviewJob({
    actorPartyId: actor.id,
    instruction: "Create an internal task directing staff to make a payment of 1 THB.",
  });
  const rejected = await rejectSecretaryJobStep({
    context,
    payload: {
      job_id: rejectedCase.job.id,
      step_id: rejectedCase.first.id,
      reason: "Do not perform this action",
    },
  });
  assert.equal(rejected.status, "queued");
  assert.equal(rejected.job.status, "QUEUED");
  assert.equal(rejected.step.status, "SKIPPED");
  assert.equal(rejected.authority_granted, false);
  assert.equal(rejected.future_steps_authorized, false);
  assert.equal(rejected.step.metadata?.review_disposition?.scope, "THIS_STEP_ONLY");
  assert.equal(rejected.step.metadata?.approval, null);

  const rejectedOutcome = await processSecretaryJob(rejected.job);
  assert.equal(rejectedOutcome.status, "review_required");
  assert.equal(rejectedOutcome.step.id, rejectedCase.stop.id);

  const priorApproval = {
    kind: "EXPLICIT_STEP_APPROVAL",
    scope: "THIS_STEP_ONLY",
    granted: true,
    approved_job_id: "stale-job-id",
    approved_step_id: "stale-step-id",
    approved_action_type: "CREATE_TASK",
    approved_instruction: "Stale approval must be destroyed by revision.",
    approved_by_party_id: actor.id,
    future_steps_authorized: false,
    authority_not_extended: true,
  };
  const revisedCase = await createReviewJob({
    actorPartyId: actor.id,
    instruction: "Create an internal task directing staff to make a payment of 3 THB.",
    metadata: { approval: priorApproval },
  });
  const revised = await reviseSecretaryJobStep({
    context,
    payload: {
      job_id: revisedCase.job.id,
      step_id: revisedCase.first.id,
      instruction: "Create an internal task documenting the corrected non-financial instruction.",
    },
  });
  assert.equal(revised.status, "queued");
  assert.equal(revised.job.status, "QUEUED");
  assert.equal(revised.step.status, "PENDING");
  assert.equal(revised.step.requires_approval, false);
  assert.equal(revised.step.metadata?.approval, null);
  assert.equal(revised.step.metadata?.review_disposition?.kind, "REVISED");
  assert.equal(revised.prior_approval_invalidated, true);
  assert.equal(revised.authority_granted, false);

  const revisedOutcome = await processSecretaryJob(revised.job);
  assert.equal(revisedOutcome.status, "review_required");
  assert.equal(revisedOutcome.step.id, revisedCase.stop.id);

  const revisedTask = await one(
    supabaseAdmin
      .from("secretary_tasks")
      .select("id,metadata")
      .eq("organization_id", organizationId)
      .eq("metadata->>secretary_job_step_id", revisedCase.first.id)
      .maybeSingle(),
    "SECRETARY_REVIEW_LOCAL_REVISED_TASK_READ_FAILED",
  );
  assert.ok(revisedTask, "SECRETARY_REVIEW_LOCAL_REVISED_SAFE_STEP_DID_NOT_EXECUTE");

  const regatedCase = await createReviewJob({
    actorPartyId: actor.id,
    instruction: "Create an internal task directing staff to make a payment of 4 THB.",
    metadata: { approval: priorApproval },
  });
  const regated = await reviseSecretaryJobStep({
    context,
    payload: {
      job_id: regatedCase.job.id,
      step_id: regatedCase.first.id,
      instruction: "Create an internal task directing staff to make a payment of 5 THB under the changed instruction.",
    },
  });
  assert.equal(regated.step.metadata?.approval, null);

  const regatedOutcome = await processSecretaryJob(regated.job);
  assert.equal(regatedOutcome.status, "review_required");
  assert.equal(regatedOutcome.step.id, regatedCase.first.id);
  assert.equal(regatedOutcome.step.last_error, "SECRETARY_JOB_HIGH_AUTHORITY_ACTION_REQUIRES_APPROVAL");

  const regatedTask = await one(
    supabaseAdmin
      .from("secretary_tasks")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("metadata->>secretary_job_step_id", regatedCase.first.id)
      .maybeSingle(),
    "SECRETARY_REVIEW_LOCAL_REGATED_TASK_READ_FAILED",
  );
  assert.equal(regatedTask, null, "SECRETARY_REVIEW_LOCAL_REVISED_HIGH_AUTHORITY_STEP_EXECUTED");

  console.log("SECRETARY_JOB_REVIEW_CONTROLS_LOCAL_CERTIFICATION=PASS");
  console.log("SECRETARY_DIRECT_JOB_INTAKE_RUNTIME=true");
  console.log("SECRETARY_JOB_LIST_READ_RUNTIME=true");
  console.log("SECRETARY_EXACT_STEP_REJECTION_RUNTIME=true");
  console.log("SECRETARY_REJECTION_GRANTS_AUTHORITY=false");
  console.log("SECRETARY_EXACT_STEP_REVISION_RUNTIME=true");
  console.log("SECRETARY_REVISION_INVALIDATES_PRIOR_APPROVAL=true");
  console.log("SECRETARY_REVISED_HIGH_AUTHORITY_REGATED=true");
  console.log("SECRETARY_JOB_CANCELLATION_RUNTIME=true");
  console.log("SECRETARY_STALE_WORKER_CANNOT_RESURRECT_CANCELLED_JOB=true");
  console.log("SECRETARY_CANCELLED_JOB_STARTS_NO_LATER_STEP=true");
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
