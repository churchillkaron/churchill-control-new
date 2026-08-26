import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const TERMINAL_JOB_STATUSES = new Set(["COMPLETED", "FAILED", "CANCELLED"]);

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function organizationId(context = {}) {
  const id = text(context.organizationId, 120);
  if (!id) throw new Error("SECRETARY_ORGANIZATION_REQUIRED");
  return id;
}

function actorPartyId(context = {}) {
  const id = text(context.actor?.partyId || context.actor?.party_id || context.metadata?.partyId, 120);
  if (!id) throw new Error("SECRETARY_REVIEW_ACTOR_PARTY_REQUIRED");
  return id;
}

async function one(result) {
  const resolved = await result;
  if (resolved.error) throw resolved.error;
  return resolved.data || null;
}

async function loadJobAndStep({ organization, jobId, stepId }) {
  const job = await one(
    supabaseAdmin
      .from("secretary_jobs")
      .select("*")
      .eq("organization_id", organization)
      .eq("id", jobId)
      .maybeSingle(),
  );
  if (!job) throw new Error("SECRETARY_JOB_NOT_FOUND");

  const step = stepId
    ? await one(
        supabaseAdmin
          .from("secretary_job_steps")
          .select("*")
          .eq("organization_id", organization)
          .eq("job_id", jobId)
          .eq("id", stepId)
          .maybeSingle(),
      )
    : null;
  if (stepId && !step) throw new Error("SECRETARY_JOB_STEP_NOT_FOUND");
  return { job, step };
}

export async function rejectSecretaryJobStep({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const actor = actorPartyId(context);
  const jobId = text(payload.job_id || payload.jobId, 120);
  const stepId = text(payload.step_id || payload.stepId, 120);
  const reason = text(payload.reason, 2000) || "Rejected by user";
  if (!jobId) throw new Error("SECRETARY_JOB_ID_REQUIRED");
  if (!stepId) throw new Error("SECRETARY_JOB_STEP_ID_REQUIRED");

  const { job, step } = await loadJobAndStep({ organization, jobId, stepId });
  if (job.status !== "REVIEW_REQUIRED") throw new Error("SECRETARY_JOB_NOT_AWAITING_REVIEW");
  if (step.status !== "APPROVAL_REQUIRED") throw new Error("SECRETARY_JOB_STEP_NOT_AWAITING_REVIEW");

  const now = new Date().toISOString();
  const rejectedStep = await one(
    supabaseAdmin
      .from("secretary_job_steps")
      .update({
        status: "SKIPPED",
        requires_approval: false,
        last_error: null,
        result: `SECRETARY_JOB_STEP_REJECTED:${reason}`,
        completed_at: now,
        metadata: {
          ...object(step.metadata),
          approval: null,
          review_disposition: {
            kind: "REJECTED",
            scope: "THIS_STEP_ONLY",
            by_party_id: actor,
            at: now,
            reason,
            authority_granted: false,
            future_steps_authorized: false,
          },
        },
        updated_at: now,
      })
      .eq("organization_id", organization)
      .eq("job_id", jobId)
      .eq("id", stepId)
      .eq("status", "APPROVAL_REQUIRED")
      .select("*")
      .single(),
  );

  const resumedJob = await one(
    supabaseAdmin
      .from("secretary_jobs")
      .update({
        status: "QUEUED",
        next_action_at: now,
        last_error: null,
        lease_token: null,
        lease_expires_at: null,
        metadata: {
          ...object(job.metadata),
          last_review_disposition: {
            kind: "REJECTED",
            step_id: stepId,
            by_party_id: actor,
            at: now,
            authority_granted: false,
          },
        },
        updated_at: now,
      })
      .eq("organization_id", organization)
      .eq("id", jobId)
      .eq("status", "REVIEW_REQUIRED")
      .select("*")
      .single(),
  );

  return { status: "queued", job: resumedJob, step: rejectedStep, authority_granted: false, future_steps_authorized: false };
}

export async function reviseSecretaryJobStep({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const actor = actorPartyId(context);
  const jobId = text(payload.job_id || payload.jobId, 120);
  const stepId = text(payload.step_id || payload.stepId, 120);
  const instruction = text(payload.instruction, 4000);
  if (!jobId) throw new Error("SECRETARY_JOB_ID_REQUIRED");
  if (!stepId) throw new Error("SECRETARY_JOB_STEP_ID_REQUIRED");
  if (!instruction) throw new Error("SECRETARY_JOB_REVISED_INSTRUCTION_REQUIRED");

  const { job, step } = await loadJobAndStep({ organization, jobId, stepId });
  if (job.status !== "REVIEW_REQUIRED") throw new Error("SECRETARY_JOB_NOT_AWAITING_REVIEW");
  if (step.status !== "APPROVAL_REQUIRED") throw new Error("SECRETARY_JOB_STEP_NOT_AWAITING_REVIEW");

  const now = new Date().toISOString();
  const revisedStep = await one(
    supabaseAdmin
      .from("secretary_job_steps")
      .update({
        instruction,
        status: "PENDING",
        requires_approval: false,
        last_error: null,
        result: null,
        started_at: null,
        completed_at: null,
        metadata: {
          ...object(step.metadata),
          approval: null,
          review_disposition: {
            kind: "REVISED",
            scope: "THIS_STEP_ONLY",
            by_party_id: actor,
            at: now,
            previous_instruction: step.instruction,
            authority_granted: false,
            future_steps_authorized: false,
          },
        },
        updated_at: now,
      })
      .eq("organization_id", organization)
      .eq("job_id", jobId)
      .eq("id", stepId)
      .eq("status", "APPROVAL_REQUIRED")
      .select("*")
      .single(),
  );

  const resumedJob = await one(
    supabaseAdmin
      .from("secretary_jobs")
      .update({
        status: "QUEUED",
        next_action_at: now,
        last_error: null,
        lease_token: null,
        lease_expires_at: null,
        metadata: {
          ...object(job.metadata),
          last_review_disposition: {
            kind: "REVISED",
            step_id: stepId,
            by_party_id: actor,
            at: now,
            authority_granted: false,
          },
        },
        updated_at: now,
      })
      .eq("organization_id", organization)
      .eq("id", jobId)
      .eq("status", "REVIEW_REQUIRED")
      .select("*")
      .single(),
  );

  return { status: "queued", job: resumedJob, step: revisedStep, prior_approval_invalidated: true, authority_granted: false };
}

export async function cancelSecretaryJob({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const actor = actorPartyId(context);
  const jobId = text(payload.job_id || payload.jobId, 120);
  const reason = text(payload.reason, 2000) || "Cancelled by user";
  if (!jobId) throw new Error("SECRETARY_JOB_ID_REQUIRED");

  const { job } = await loadJobAndStep({ organization, jobId, stepId: null });
  if (TERMINAL_JOB_STATUSES.has(job.status)) throw new Error("SECRETARY_JOB_ALREADY_TERMINAL");

  const now = new Date().toISOString();
  const cancelled = await one(
    supabaseAdmin
      .from("secretary_jobs")
      .update({
        status: "CANCELLED",
        next_action_at: null,
        last_error: null,
        completed_at: now,
        lease_token: null,
        lease_expires_at: null,
        metadata: {
          ...object(job.metadata),
          cancellation: {
            by_party_id: actor,
            at: now,
            reason,
            external_authority_used: false,
          },
        },
        updated_at: now,
      })
      .eq("organization_id", organization)
      .eq("id", jobId)
      .select("*")
      .single(),
  );

  await supabaseAdmin
    .from("secretary_job_steps")
    .update({
      status: "SKIPPED",
      requires_approval: false,
      last_error: null,
      completed_at: now,
      updated_at: now,
    })
    .eq("organization_id", organization)
    .eq("job_id", jobId)
    .in("status", ["PENDING", "APPROVAL_REQUIRED"]);

  return { status: "cancelled", job: cancelled, secretary_owns_follow_through: false, external_authority_used: false };
}

export default Object.freeze({
  rejectStep: rejectSecretaryJobStep,
  reviseStep: reviseSecretaryJobStep,
  cancel: cancelSecretaryJob,
});