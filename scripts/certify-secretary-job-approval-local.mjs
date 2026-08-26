import assert from "node:assert/strict";

function required(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`SECRETARY_APPROVAL_LOCAL_ENV_REQUIRED:${name}`);
  return value;
}

function assertLocalSupabase(urlValue) {
  let url;
  try {
    url = new URL(urlValue);
  } catch {
    throw new Error("SECRETARY_APPROVAL_LOCAL_SUPABASE_URL_INVALID");
  }
  if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(url.hostname)) {
    throw new Error("SECRETARY_APPROVAL_LOCAL_REFUSED_NON_LOCAL_SUPABASE");
  }
  return url;
}

async function one(result, label) {
  if (result.error) {
    throw new Error(`${label}:${result.error.code || "UNKNOWN"}:${result.error.message || "ERROR"}`);
  }
  return result.data || null;
}

const supabaseUrl = required("NEXT_PUBLIC_SUPABASE_URL");
required("SUPABASE_SERVICE_ROLE_KEY");
assertLocalSupabase(supabaseUrl);

const { supabaseAdmin } = await import("../lib/shared/supabase/admin.js");
const { approveSecretaryJobStep } = await import("../lib/operator/secretary/SecretaryJobApprovalRuntime.js");
const { processSecretaryJob } = await import("../lib/operator/secretary/SecretaryJobExecutionRuntime.js");

let organizationId = null;

async function createReviewJob({ actorPartyId, firstInstruction, firstAction = "CREATE_TASK", firstError = "SECRETARY_JOB_HIGH_AUTHORITY_ACTION_REQUIRES_APPROVAL", firstRequiresApproval = true }) {
  const job = await one(
    await supabaseAdmin
      .from("secretary_jobs")
      .insert({
        organization_id: organizationId,
        requested_by_party_id: actorPartyId,
        source_kind: "MANUAL",
        objective: "Local Secretary approval runtime certification",
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
    "SECRETARY_APPROVAL_LOCAL_JOB_INSERT_FAILED",
  );

  const steps = await one(
    await supabaseAdmin
      .from("secretary_job_steps")
      .insert([
        {
          organization_id: organizationId,
          job_id: job.id,
          sequence_number: 1,
          action_type: firstAction,
          instruction: firstInstruction,
          status: "APPROVAL_REQUIRED",
          requires_approval: firstRequiresApproval,
          last_error: firstError,
          result: firstError,
          metadata: { local_certification: true, external_authority_used: false },
        },
        {
          organization_id: organizationId,
          job_id: job.id,
          sequence_number: 2,
          action_type: "REVIEW",
          instruction: "Stop after the local certification step so no provider-backed job summary is requested.",
          status: "PENDING",
          requires_approval: false,
          metadata: { local_certification: true, external_authority_used: false },
        },
      ])
      .select("*"),
    "SECRETARY_APPROVAL_LOCAL_STEP_INSERT_FAILED",
  );

  return { job, first: steps[0], stop: steps[1] };
}

try {
  const organization = await one(
    await supabaseAdmin
      .from("organizations")
      .insert({ name: "Secretary Approval Local Certification" })
      .select("id")
      .single(),
    "SECRETARY_APPROVAL_LOCAL_ORGANIZATION_INSERT_FAILED",
  );
  organizationId = organization.id;

  const actor = await one(
    await supabaseAdmin
      .from("parties")
      .insert({
        organization_id: organizationId,
        display_name: "Local Secretary Approver",
        party_type: "PERSON",
        status: "ACTIVE",
        metadata: { local_certification: true },
      })
      .select("id")
      .single(),
    "SECRETARY_APPROVAL_LOCAL_ACTOR_INSERT_FAILED",
  );

  const context = {
    organizationId,
    actor: { partyId: actor.id },
    metadata: { partyId: actor.id, localCertification: true },
  };

  const exact = await createReviewJob({
    actorPartyId: actor.id,
    firstInstruction: "Create an internal task directing staff to make a payment of 1 THB only under this exact step approval.",
  });

  const approved = await approveSecretaryJobStep({
    context,
    payload: {
      job_id: exact.job.id,
      step_id: exact.first.id,
      approval_note: "Local certification exact-step approval",
    },
  });

  assert.equal(approved.status, "queued");
  assert.equal(approved.job.status, "QUEUED");
  assert.equal(approved.step.status, "PENDING");
  assert.equal(approved.step.requires_approval, false);
  assert.equal(approved.approval.scope, "THIS_STEP_ONLY");
  assert.equal(approved.approval.approved_job_id, exact.job.id);
  assert.equal(approved.approval.approved_step_id, exact.first.id);
  assert.equal(approved.approval.approved_instruction, exact.first.instruction);
  assert.equal(approved.approval.future_steps_authorized, false);
  assert.equal(approved.approval.authority_not_extended, true);

  const executed = await processSecretaryJob(approved.job);
  assert.equal(executed.status, "review_required");
  assert.equal(executed.step.id, exact.stop.id);

  const executedFirst = await one(
    await supabaseAdmin
      .from("secretary_job_steps")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("id", exact.first.id)
      .single(),
    "SECRETARY_APPROVAL_LOCAL_EXECUTED_STEP_READ_FAILED",
  );
  assert.equal(executedFirst.status, "COMPLETED");

  const exactTasks = await one(
    await supabaseAdmin
      .from("secretary_tasks")
      .select("id,metadata")
      .eq("organization_id", organizationId),
    "SECRETARY_APPROVAL_LOCAL_TASK_READ_FAILED",
  );
  const exactTask = exactTasks.find((row) => row.metadata?.secretary_job_step_id === exact.first.id);
  assert.ok(exactTask, "SECRETARY_APPROVAL_LOCAL_EXACT_STEP_DID_NOT_EXECUTE");

  const tampered = await createReviewJob({
    actorPartyId: actor.id,
    firstInstruction: "Create an internal task directing staff to make a payment of 1 THB under this exact approved instruction.",
  });
  const tamperedApproval = await approveSecretaryJobStep({
    context,
    payload: { job_id: tampered.job.id, step_id: tampered.first.id },
  });

  const changedInstruction = "Create an internal task directing staff to make a payment of 2 THB under a materially changed instruction.";
  await one(
    await supabaseAdmin
      .from("secretary_job_steps")
      .update({ instruction: changedInstruction, updated_at: new Date().toISOString() })
      .eq("organization_id", organizationId)
      .eq("id", tampered.first.id)
      .select("*")
      .single(),
    "SECRETARY_APPROVAL_LOCAL_TAMPER_UPDATE_FAILED",
  );

  const tamperedOutcome = await processSecretaryJob(tamperedApproval.job);
  assert.equal(tamperedOutcome.status, "review_required");
  assert.equal(tamperedOutcome.step.id, tampered.first.id);
  assert.equal(tamperedOutcome.step.last_error, "SECRETARY_JOB_HIGH_AUTHORITY_ACTION_REQUIRES_APPROVAL");

  const tasksAfterTamper = await one(
    await supabaseAdmin
      .from("secretary_tasks")
      .select("id,metadata")
      .eq("organization_id", organizationId),
    "SECRETARY_APPROVAL_LOCAL_TAMPER_TASK_READ_FAILED",
  );
  assert.equal(
    tasksAfterTamper.some((row) => row.metadata?.secretary_job_step_id === tampered.first.id),
    false,
    "SECRETARY_APPROVAL_LOCAL_CHANGED_INSTRUCTION_REUSED_APPROVAL",
  );

  const operational = await createReviewJob({
    actorPartyId: actor.id,
    firstAction: "CREATE_EVENT",
    firstInstruction: "Book the meeting when the missing date and time are supplied.",
    firstError: "SECRETARY_JOB_EVENT_TIME_REQUIRES_STRUCTURED_DATE",
    firstRequiresApproval: true,
  });

  let operationalError = null;
  try {
    await approveSecretaryJobStep({
      context,
      payload: { job_id: operational.job.id, step_id: operational.first.id },
    });
  } catch (error) {
    operationalError = String(error?.message || error);
  }
  assert.equal(operationalError, "SECRETARY_JOB_STEP_REQUIRES_INPUT_NOT_APPROVAL");

  const operationalStep = await one(
    await supabaseAdmin
      .from("secretary_job_steps")
      .select("status,requires_approval,last_error,metadata")
      .eq("organization_id", organizationId)
      .eq("id", operational.first.id)
      .single(),
    "SECRETARY_APPROVAL_LOCAL_OPERATIONAL_STEP_READ_FAILED",
  );
  assert.equal(operationalStep.status, "APPROVAL_REQUIRED");
  assert.equal(operationalStep.last_error, "SECRETARY_JOB_EVENT_TIME_REQUIRES_STRUCTURED_DATE");
  assert.equal(Boolean(operationalStep.metadata?.approval), false);

  console.log("SECRETARY_JOB_APPROVAL_LOCAL_CERTIFICATION=PASS");
  console.log("SECRETARY_APPROVAL_REQUEUE_RUNTIME=true");
  console.log("SECRETARY_EXACT_STEP_APPROVAL_RESUME=true");
  console.log("SECRETARY_CHANGED_INSTRUCTION_INVALIDATES_APPROVAL=true");
  console.log("SECRETARY_OPERATIONAL_REVIEW_NOT_APPROVABLE=true");
  console.log("SECRETARY_APPROVAL_RUNTIME_CERTIFIED=true");
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
