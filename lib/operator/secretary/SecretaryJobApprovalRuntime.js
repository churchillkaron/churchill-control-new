import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const APPROVAL_GATE_REASONS = new Set([
  "SECRETARY_JOB_STEP_APPROVAL_REQUIRED",
  "SECRETARY_JOB_HIGH_AUTHORITY_ACTION_REQUIRES_APPROVAL",
]);

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
  const id = text(
    context.actor?.partyId || context.actor?.party_id || context.metadata?.partyId,
    120,
  );
  if (!id) throw new Error("SECRETARY_APPROVER_PARTY_REQUIRED");
  return id;
}

function isAuthorityApprovalGate(step = {}) {
  // A concrete runtime review reason is newer and more specific than the planner's
  // original requires_approval flag. Operational failures (missing input, calendar
  // ambiguity/conflicts, invalid targets, etc.) must be corrected, not authorized.
  const currentReason = text(step.last_error, 200);
  if (currentReason) return APPROVAL_GATE_REASONS.has(currentReason);
  return step.requires_approval === true;
}

async function one(result) {
  const resolved = await result;
  if (resolved.error) throw resolved.error;
  return resolved.data || null;
}

export async function approveSecretaryJobStep({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const approvedByPartyId = actorPartyId(context);
  const jobId = text(payload.job_id || payload.jobId, 120);
  const stepId = text(payload.step_id || payload.stepId, 120);
  const approvalNote = text(payload.approval_note || payload.approvalNote, 2000) || null;
  if (!jobId) throw new Error("SECRETARY_JOB_ID_REQUIRED");
  if (!stepId) throw new Error("SECRETARY_JOB_STEP_ID_REQUIRED");

  const job = await one(
    supabaseAdmin
      .from("secretary_jobs")
      .select("*")
      .eq("organization_id", organization)
      .eq("id", jobId)
      .maybeSingle(),
  );
  if (!job) throw new Error("SECRETARY_JOB_NOT_FOUND");
  if (job.status !== "REVIEW_REQUIRED") throw new Error("SECRETARY_JOB_NOT_AWAITING_APPROVAL");

  const step = await one(
    supabaseAdmin
      .from("secretary_job_steps")
      .select("*")
      .eq("organization_id", organization)
      .eq("job_id", jobId)
      .eq("id", stepId)
      .maybeSingle(),
  );
  if (!step) throw new Error("SECRETARY_JOB_STEP_NOT_FOUND");
  if (step.status !== "APPROVAL_REQUIRED") throw new Error("SECRETARY_JOB_STEP_NOT_AWAITING_APPROVAL");
  if (!isAuthorityApprovalGate(step)) throw new Error("SECRETARY_JOB_STEP_REQUIRES_INPUT_NOT_APPROVAL");
  if (step.action_type === "REVIEW") throw new Error("SECRETARY_JOB_REVIEW_STEP_NOT_EXECUTABLE_BY_APPROVAL");

  const approvedAt = new Date().toISOString();
  const exactApproval = {
    kind: "EXPLICIT_STEP_APPROVAL",
    scope: "THIS_STEP_ONLY",
    granted: true,
    approved_job_id: job.id,
    approved_step_id: step.id,
    approved_action_type: step.action_type,
    approved_instruction: step.instruction,
    approved_by_party_id: approvedByPartyId,
    approved_at: approvedAt,
    approval_note: approvalNote,
    authority_not_extended: true,
    future_steps_authorized: false,
    external_authority_used: false,
  };

  const approvedStep = await one(
    supabaseAdmin
      .from("secretary_job_steps")
      .update({
        status: "PENDING",
        requires_approval: false,
        last_error: null,
        result: null,
        metadata: {
          ...object(step.metadata),
          approval: exactApproval,
        },
        updated_at: approvedAt,
      })
      .eq("organization_id", organization)
      .eq("job_id", job.id)
      .eq("id", step.id)
      .eq("status", "APPROVAL_REQUIRED")
      .select("*")
      .single(),
  );

  const resumedJob = await one(
    supabaseAdmin
      .from("secretary_jobs")
      .update({
        status: "QUEUED",
        next_action_at: approvedAt,
        last_error: null,
        lease_token: null,
        lease_expires_at: null,
        metadata: {
          ...object(job.metadata),
          last_step_approval: {
            job_id: job.id,
            step_id: step.id,
            approved_by_party_id: approvedByPartyId,
            approved_at: approvedAt,
            scope: "THIS_STEP_ONLY",
            authority_not_extended: true,
          },
        },
        updated_at: approvedAt,
      })
      .eq("organization_id", organization)
      .eq("id", job.id)
      .eq("status", "REVIEW_REQUIRED")
      .select("*")
      .single(),
  );

  return {
    status: "queued",
    job: resumedJob,
    step: approvedStep,
    approval: exactApproval,
    secretary_owns_follow_through: true,
    approval_scope: "THIS_STEP_ONLY",
    future_steps_authorized: false,
    external_authority_used: false,
  };
}

export default approveSecretaryJobStep;
