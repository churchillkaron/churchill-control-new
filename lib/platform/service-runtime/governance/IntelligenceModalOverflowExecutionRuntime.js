import { supabaseAdmin } from "../../../shared/supabase/admin.js";
import {
  assertIntelligenceModalOverflowCeiling,
  measuredIntelligenceModalOverflowSupplierCostThb,
} from "./IntelligenceModalOverflowCostPolicy.js";

const INFRASTRUCTURE = "MODAL_H100_ASYNC_V1";

function text(value, limit = 1000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function approvalId(input = {}) {
  return text(
    input.modal_compute_approval_id ||
      input.modalComputeApprovalId ||
      input.context?.modal_compute_approval_id ||
      input.context?.modalComputeApprovalId ||
      input.metadata?.modal_compute_approval_id ||
      input.provider_parameters?.modal_compute_approval_id,
    120,
  );
}

function requestedSupplierCostThb(input = {}) {
  return number(
    input.context?.modal_requested_supplier_cost_thb ??
      input.modal_requested_supplier_cost_thb ??
      input.modalRequestedSupplierCostThb ??
      input.metadata?.modal_requested_supplier_cost_thb ??
      input.provider_parameters?.modal_requested_supplier_cost_thb,
  );
}

export async function claimIntelligenceModalOverflowExecution({ input = {}, lane, reasonCode } = {}) {
  const organizationId = text(input.context?.organization_id, 120);
  const usageId = text(input.context?.usage_id, 240);
  const capability = text(input.capability, 200);
  const resolvedApprovalId = approvalId(input);
  const requestedCost = requestedSupplierCostThb(input);
  const requestFingerprint = text(input.intelligence_modal_overflow_request_fingerprint, 128);
  const proof = object(input.intelligence_modal_overflow || input.intelligenceModalOverflow);

  if (!organizationId) throw new Error("INTELLIGENCE_MODAL_OVERFLOW_ORGANIZATION_REQUIRED");
  if (!usageId) throw new Error("INTELLIGENCE_MODAL_OVERFLOW_USAGE_ID_REQUIRED");
  if (!capability) throw new Error("INTELLIGENCE_MODAL_OVERFLOW_CAPABILITY_REQUIRED");
  if (!requestFingerprint) throw new Error("INTELLIGENCE_MODAL_OVERFLOW_REQUEST_FINGERPRINT_REQUIRED");
  if (!resolvedApprovalId) throw new Error("INTELLIGENCE_MODAL_OVERFLOW_EXACT_APPROVAL_ID_REQUIRED");
  if (!(requestedCost > 0)) throw new Error("INTELLIGENCE_MODAL_OVERFLOW_COST_REQUIRED");
  assertIntelligenceModalOverflowCeiling({ lane, ceilingThb: requestedCost });

  const { data, error } = await supabaseAdmin.rpc("claim_intelligence_modal_overflow_execution", {
    p_organization_id: organizationId,
    p_approval_id: resolvedApprovalId,
    p_usage_id: usageId,
    p_request_fingerprint: requestFingerprint,
    p_capability: capability,
    p_execution_lane: text(lane, 40).toLowerCase(),
    p_reason_code: text(reasonCode, 120).toUpperCase(),
    p_infrastructure_provider: INFRASTRUCTURE,
    p_requested_supplier_cost_thb: requestedCost,
    p_local_capacity_checked: proof.local_capacity_checked === true,
    p_local_attempted: proof.local_attempted === true,
    p_local_failure_code: text(proof.local_failure_code, 500) || null,
    p_local_assessment_reference: text(proof.local_assessment_reference, 500) || null,
  });
  if (error) throw error;
  if (!data?.execution_claim_id) throw new Error("INTELLIGENCE_MODAL_OVERFLOW_EXECUTION_CLAIM_INVALID");
  return data;
}

export async function markIntelligenceModalOverflowSubmitted({
  executionClaimId,
  providerJobId,
  providerFunction,
  providerModel,
} = {}) {
  const id = text(executionClaimId, 120);
  const jobId = text(providerJobId, 500);
  if (!id || !jobId) throw new Error("INTELLIGENCE_MODAL_OVERFLOW_SUBMISSION_BINDING_REQUIRED");
  const { data, error } = await supabaseAdmin
    .from("intelligence_modal_overflow_executions")
    .update({
      status: "SUBMITTED",
      provider_job_id: jobId,
      provider_function: text(providerFunction, 120) || null,
      provider_model: text(providerModel, 240) || null,
      submitted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "RESERVED")
    .is("provider_job_id", null)
    .select("id,approval_id,organization_id,usage_id,status,provider_job_id,execution_lane,requested_supplier_cost_thb")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("INTELLIGENCE_MODAL_OVERFLOW_SUBMISSION_BINDING_FAILED");
  return data;
}

export async function markIntelligenceModalOverflowSubmissionUncertain({ executionClaimId, failureCode } = {}) {
  const id = text(executionClaimId, 120);
  if (!id) return null;
  const { data, error } = await supabaseAdmin
    .from("intelligence_modal_overflow_executions")
    .update({
      status: "SUBMISSION_UNCERTAIN",
      failure_code: text(failureCode, 500) || "UNKNOWN_SUBMISSION_FAILURE",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "RESERVED")
    .select("id,status,failure_code")
    .maybeSingle();
  if (error) throw error;
  return data || null;
}


export async function markIntelligenceModalOverflowTerminal({
  organizationId,
  providerJobId,
  status,
  failureCode = null,
  metadata = null,
  modalElapsedSeconds = null,
} = {}) {
  const org = text(organizationId, 120);
  const jobId = text(providerJobId, 500);
  const terminal = text(status, 40).toUpperCase();
  if (!org || !jobId) throw new Error("INTELLIGENCE_MODAL_OVERFLOW_TERMINAL_BINDING_REQUIRED");
  if (!["COMPLETED", "FAILED", "CANCELLED"].includes(terminal)) {
    throw new Error(`INTELLIGENCE_MODAL_OVERFLOW_TERMINAL_STATUS_INVALID:${terminal || "NONE"}`);
  }
  const now = new Date().toISOString();
  const patch = {
    status: terminal,
    failure_code: failureCode ? text(failureCode, 500) : null,
    completed_at: now,
    updated_at: now,
    ...(metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? { terminal_metadata: metadata }
      : {}),
    ...(Number.isFinite(Number(modalElapsedSeconds)) && Number(modalElapsedSeconds) >= 0
      ? { modal_elapsed_seconds: Number(modalElapsedSeconds) }
      : {}),
  };
  const { data, error } = await supabaseAdmin
    .from("intelligence_modal_overflow_executions")
    .update(patch)
    .eq("organization_id", org)
    .eq("provider_job_id", jobId)
    .in("status", ["SUBMITTED", "SETTLEMENT_UNCERTAIN"])
    .select("id,approval_id,organization_id,usage_id,status,provider_job_id,execution_lane,requested_supplier_cost_thb")
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function markIntelligenceModalOverflowSettlementUncertain({
  organizationId,
  providerJobId,
  failureCode,
} = {}) {
  const org = text(organizationId, 120);
  const jobId = text(providerJobId, 500);
  if (!org || !jobId) return null;
  const { data, error } = await supabaseAdmin
    .from("intelligence_modal_overflow_executions")
    .update({
      status: "SETTLEMENT_UNCERTAIN",
      failure_code: text(failureCode, 500) || "UNKNOWN_SETTLEMENT_FAILURE",
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", org)
    .eq("provider_job_id", jobId)
    .eq("status", "SUBMITTED")
    .select("id,status,failure_code")
    .maybeSingle();
  if (error) throw error;
  return data || null;
}


export async function settleIntelligenceModalOverflowSupplierCost({ organizationId, providerJobId } = {}) {
  const org = text(organizationId, 120);
  const jobId = text(providerJobId, 500);
  if (!org || !jobId) throw new Error("INTELLIGENCE_MODAL_OVERFLOW_COST_SETTLEMENT_BINDING_REQUIRED");
  const { data: row, error } = await supabaseAdmin
    .from("intelligence_modal_overflow_executions")
    .select("id,organization_id,approval_id,usage_id,execution_lane,status,provider_job_id,requested_supplier_cost_thb,submitted_at,completed_at,actual_supplier_cost_thb,modal_elapsed_seconds")
    .eq("organization_id", org)
    .eq("provider_job_id", jobId)
    .maybeSingle();
  if (error) throw error;
  if (!row) throw new Error("INTELLIGENCE_MODAL_OVERFLOW_COST_SETTLEMENT_CLAIM_NOT_FOUND");
  if (text(row.status, 40).toUpperCase() !== "COMPLETED") {
    throw new Error(`INTELLIGENCE_MODAL_OVERFLOW_COST_SETTLEMENT_NOT_COMPLETED:${text(row.status, 40)}`);
  }
  const submittedAt = Date.parse(text(row.submitted_at, 120));
  const completedAt = Date.parse(text(row.completed_at, 120));
  if (!Number.isFinite(submittedAt) || !Number.isFinite(completedAt) || completedAt < submittedAt) {
    throw new Error("INTELLIGENCE_MODAL_OVERFLOW_COST_SETTLEMENT_TIMESTAMPS_INVALID");
  }
  const measured = measuredIntelligenceModalOverflowSupplierCostThb({
    lane: row.execution_lane,
    wallSeconds: (completedAt - submittedAt) / 1000,
  });
  const approvedCeiling = Number(row.requested_supplier_cost_thb);
  if (!(approvedCeiling > 0) || measured.supplier_cost_thb > approvedCeiling + 0.000001) {
    throw new Error(`INTELLIGENCE_MODAL_OVERFLOW_ACTUAL_COST_EXCEEDS_APPROVAL:${measured.supplier_cost_thb}:${approvedCeiling}`);
  }
  const { data: settled, error: updateError } = await supabaseAdmin
    .from("intelligence_modal_overflow_executions")
    .update({
      actual_supplier_cost_thb: measured.supplier_cost_thb,
      settlement_wall_seconds: measured.measured_wall_seconds,
      settlement_thb_per_second: measured.thb_per_second,
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id)
    .eq("status", "COMPLETED")
    .select("id,approval_id,usage_id,execution_lane,provider_job_id,requested_supplier_cost_thb,actual_supplier_cost_thb,settlement_wall_seconds,settlement_thb_per_second")
    .single();
  if (updateError) throw updateError;
  return {
    ...measured,
    approval_id: settled.approval_id,
    execution_claim_id: settled.id,
    usage_id: settled.usage_id,
    approved_ceiling_thb: Number(settled.requested_supplier_cost_thb),
    actual_supplier_cost_thb: Number(settled.actual_supplier_cost_thb),
  };
}
