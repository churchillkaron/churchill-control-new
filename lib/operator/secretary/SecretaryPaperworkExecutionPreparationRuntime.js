import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  classifySecretaryPaperworkAuthority,
  secretaryPaperworkInstructionRequiresExactApproval,
  secretaryPaperworkStepHasExactApproval,
} from "@/lib/operator/secretary/SecretaryPaperworkAuthorityPolicy";

function text(value, limit = 8000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

async function many(result) {
  const resolved = await result;
  if (resolved.error) throw resolved.error;
  return Array.isArray(resolved.data) ? resolved.data : [];
}

async function one(result) {
  const resolved = await result;
  if (resolved.error) throw resolved.error;
  return resolved.data || null;
}

function isPaperworkJob(job = {}) {
  return text(object(job.metadata).job_kind, 120) === "PAPERWORK_COORDINATION";
}

function approvalReason(classification) {
  if (classification.signature_or_attestation_detected) return "SECRETARY_PAPERWORK_SIGNATURE_REQUIRES_EXACT_STEP_APPROVAL";
  if (classification.payment_detected) return "SECRETARY_PAPERWORK_FEE_OR_PAYMENT_REQUIRES_EXACT_STEP_APPROVAL";
  if (classification.acceptance_detected) return "SECRETARY_PAPERWORK_ACCEPTANCE_REQUIRES_EXACT_STEP_APPROVAL";
  if (classification.binding_submission_detected) return "SECRETARY_PAPERWORK_BINDING_SUBMISSION_REQUIRES_EXACT_STEP_APPROVAL";
  if (classification.credential_detected) return "SECRETARY_PAPERWORK_CREDENTIAL_USE_REQUIRES_EXACT_STEP_APPROVAL";
  return "SECRETARY_PAPERWORK_HIGH_AUTHORITY_ACTION_REQUIRES_EXACT_STEP_APPROVAL";
}

export async function prepareSecretaryPaperworkExecution({ limit = 100 } = {}) {
  const capped = Math.max(1, Math.min(Number(limit) || 100, 500));
  const jobs = await many(
    supabaseAdmin
      .from("secretary_jobs")
      .select("*")
      .in("status", ["QUEUED", "PLANNING", "ACTIVE", "WAITING", "REVIEW_REQUIRED"])
      .order("created_at", { ascending: true })
      .limit(capped),
  );

  const paperworkJobs = jobs.filter(isPaperworkJob);
  const prepared = [];
  for (const job of paperworkJobs) {
    const steps = await many(
      supabaseAdmin
        .from("secretary_job_steps")
        .select("*")
        .eq("organization_id", job.organization_id)
        .eq("job_id", job.id)
        .order("sequence_number", { ascending: true }),
    );
    if (!steps.length) {
      prepared.push({ job_id: job.id, status: "awaiting_plan", gated_steps: 0 });
      continue;
    }

    let gatedSteps = 0;
    for (const step of steps) {
      if (["COMPLETED", "SKIPPED"].includes(step.status)) continue;
      if (!secretaryPaperworkInstructionRequiresExactApproval(step.instruction)) continue;
      if (secretaryPaperworkStepHasExactApproval(job, step)) continue;

      const classification = classifySecretaryPaperworkAuthority(step.instruction);
      const reason = approvalReason(classification);
      const metadata = {
        ...object(step.metadata),
        paperwork_authority_gate: {
          kind: "DETERMINISTIC_PAPERWORK_AUTHORITY_GATE",
          exact_step_approval_required: true,
          classification,
          authority_not_extended: true,
          future_steps_authorized: false,
          external_authority_used: false,
        },
      };

      const update = await supabaseAdmin
        .from("secretary_job_steps")
        .update({
          status: "APPROVAL_REQUIRED",
          requires_approval: true,
          last_error: reason,
          result: reason,
          metadata,
          updated_at: new Date().toISOString(),
        })
        .eq("organization_id", job.organization_id)
        .eq("job_id", job.id)
        .eq("id", step.id)
        .not("status", "in", '(COMPLETED,SKIPPED)');
      if (update.error) throw update.error;
      gatedSteps += 1;
    }

    if (gatedSteps > 0) {
      const current = await one(
        supabaseAdmin
          .from("secretary_jobs")
          .select("*")
          .eq("organization_id", job.organization_id)
          .eq("id", job.id)
          .maybeSingle(),
      );
      if (current && current.status !== "CANCELLED") {
        const metadata = {
          ...object(current.metadata),
          paperwork_authority_prepared_at: new Date().toISOString(),
          paperwork_deterministic_authority_gate: true,
          signature_authority_created: false,
          binding_submission_authority_created: false,
          legal_acceptance_authority_created: false,
          payment_authority_created: false,
          external_authority_used: false,
        };
        const jobUpdate = await supabaseAdmin
          .from("secretary_jobs")
          .update({
            status: "REVIEW_REQUIRED",
            next_action_at: null,
            last_error: "SECRETARY_PAPERWORK_EXACT_STEP_APPROVAL_REQUIRED",
            metadata,
            lease_token: null,
            lease_expires_at: null,
            updated_at: new Date().toISOString(),
          })
          .eq("organization_id", job.organization_id)
          .eq("id", job.id)
          .neq("status", "CANCELLED");
        if (jobUpdate.error) throw jobUpdate.error;
      }
    }

    prepared.push({
      job_id: job.id,
      status: gatedSteps > 0 ? "review_required" : "prepared",
      gated_steps: gatedSteps,
    });
  }

  return {
    status: "completed",
    contract: "AVANTIQO_SECRETARY_PAPERWORK_EXECUTION_PREPARATION_V1",
    inspected_jobs: paperworkJobs.length,
    prepared,
    external_authority_used: false,
  };
}

export default Object.freeze({
  prepare: prepareSecretaryPaperworkExecution,
});
