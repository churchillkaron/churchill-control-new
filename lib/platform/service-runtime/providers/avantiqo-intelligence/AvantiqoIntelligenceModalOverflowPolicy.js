const CONTRACT = "AVANTIQO_INTELLIGENCE_MODAL_OVERFLOW_POLICY_V1";
const OVERFLOW_INFRASTRUCTURE = "MODAL_H100_ASYNC_V1";
const LANES = new Set(["fast", "deep"]);
const REASON_CODES = new Set([
  "LOCAL_CONTEXT_CAPACITY_EXCEEDED",
  "LOCAL_OUTPUT_CAPACITY_EXCEEDED",
  "LOCAL_GPU_MEMORY_INSUFFICIENT",
  "LOCAL_LARGE_MODEL_CAPABILITY_REQUIRED",
]);

function text(value, limit = 1000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function enabled(value) {
  return ["1", "true", "yes", "on"].includes(text(value, 20).toLowerCase());
}

function positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function approvalId(input = {}) {
  return text(
    input.modal_compute_approval_id ||
      input.modalComputeApprovalId ||
      input.context?.modal_compute_approval_id ||
      input.metadata?.modal_compute_approval_id ||
      input.provider_parameters?.modal_compute_approval_id,
    120,
  );
}

function requestedSupplierCostThb(input = {}) {
  return positiveNumber(
    input.context?.modal_requested_supplier_cost_thb ??
      input.modal_requested_supplier_cost_thb ??
      input.modalRequestedSupplierCostThb ??
      input.metadata?.modal_requested_supplier_cost_thb ??
      input.provider_parameters?.modal_requested_supplier_cost_thb,
  );
}

function requestedReasonCode(input = {}) {
  return text(
    input.intelligence_modal_overflow_reason_code ||
      input.modal_overflow_reason_code ||
      input.metadata?.intelligence_modal_overflow_reason_code ||
      input.provider_parameters?.intelligence_modal_overflow_reason_code,
    120,
  ).toUpperCase();
}


export function intelligenceModalOverflowProposalWorkflowEnabled() {
  return intelligenceModalPaidExecutionAllowed();
}

export function intelligenceModalPaidExecutionAllowed() {
  return process.env.VERCEL_ENV === "production" &&
    enabled(process.env.AVANTIQO_INTELLIGENCE_MODAL_OVERFLOW_PROPOSALS_ENABLED);
}

export function intelligenceModalOverflowApprovalRequested(input = {}) {
  return intelligenceModalPaidExecutionAllowed() && Boolean(approvalId(input));
}

export function buildIntelligenceModalOverflowProof({
  input = {},
  lane,
  reasonCode,
  localCapacityChecked = false,
  localAttempted = false,
  localFailureCode = null,
  localAssessmentReference = null,
} = {}) {
  const normalizedLane = text(lane || input.execution_lane || input.executionLane, 40).toLowerCase();
  const normalizedReason = text(reasonCode || requestedReasonCode(input), 120).toUpperCase();
  return {
    contract: CONTRACT,
    infrastructure_provider: OVERFLOW_INFRASTRUCTURE,
    lane: normalizedLane,
    reason_code: normalizedReason,
    local_first_required: true,
    local_capacity_checked: localCapacityChecked === true,
    local_attempted: localAttempted === true,
    local_insufficient: true,
    local_failure_code: text(localFailureCode, 240) || null,
    local_assessment_reference: text(localAssessmentReference, 240) || null,
    automatic_fallback: false,
    explicit_approval_required: true,
  };
}

export function assertIntelligenceModalOverflowRequest(input = {}) {
  if (!intelligenceModalPaidExecutionAllowed()) {
    throw new Error("AVANTIQO_INTELLIGENCE_MODAL_PAID_EXECUTION_DISABLED_OUTSIDE_PRODUCTION");
  }
  const lane = text(input.execution_lane || input.executionLane, 40).toLowerCase();
  if (!LANES.has(lane)) {
    throw new Error(`AVANTIQO_INTELLIGENCE_MODAL_OVERFLOW_LANE_FORBIDDEN:${lane || "NONE"}`);
  }

  const id = approvalId(input);
  if (!id) throw new Error("AVANTIQO_INTELLIGENCE_MODAL_OVERFLOW_APPROVAL_REQUIRED");

  const cost = requestedSupplierCostThb(input);
  if (!cost) throw new Error("AVANTIQO_INTELLIGENCE_MODAL_OVERFLOW_COST_ESTIMATE_REQUIRED");

  const proof = object(input.intelligence_modal_overflow || input.intelligenceModalOverflow);
  if (text(proof.contract, 160) !== CONTRACT) {
    throw new Error("AVANTIQO_INTELLIGENCE_MODAL_OVERFLOW_PROOF_REQUIRED");
  }
  if (text(proof.infrastructure_provider, 120).toUpperCase() !== OVERFLOW_INFRASTRUCTURE) {
    throw new Error("AVANTIQO_INTELLIGENCE_MODAL_OVERFLOW_INFRASTRUCTURE_INVALID");
  }
  if (text(proof.lane, 40).toLowerCase() !== lane) {
    throw new Error("AVANTIQO_INTELLIGENCE_MODAL_OVERFLOW_LANE_MISMATCH");
  }
  const reasonCode = text(proof.reason_code, 120).toUpperCase();
  if (!REASON_CODES.has(reasonCode)) {
    throw new Error(`AVANTIQO_INTELLIGENCE_MODAL_OVERFLOW_REASON_INVALID:${reasonCode || "NONE"}`);
  }
  if (proof.local_first_required !== true || proof.local_insufficient !== true) {
    throw new Error("AVANTIQO_INTELLIGENCE_MODAL_OVERFLOW_LOCAL_INSUFFICIENCY_REQUIRED");
  }
  if (proof.local_capacity_checked !== true && proof.local_attempted !== true) {
    throw new Error("AVANTIQO_INTELLIGENCE_MODAL_OVERFLOW_LOCAL_PROOF_REQUIRED");
  }
  if (proof.automatic_fallback !== false || proof.explicit_approval_required !== true) {
    throw new Error("AVANTIQO_INTELLIGENCE_MODAL_OVERFLOW_AUTOMATIC_FALLBACK_FORBIDDEN");
  }
  if (
    reasonCode === "LOCAL_LARGE_MODEL_CAPABILITY_REQUIRED" &&
    !text(proof.local_assessment_reference, 240)
  ) {
    throw new Error("AVANTIQO_INTELLIGENCE_MODAL_OVERFLOW_LOCAL_ASSESSMENT_REQUIRED");
  }

  return {
    contract: CONTRACT,
    approval_id: id,
    requested_supplier_cost_thb: cost,
    infrastructure_provider: OVERFLOW_INFRASTRUCTURE,
    lane,
    reason_code: reasonCode,
    proof,
  };
}

export const AVANTIQO_INTELLIGENCE_MODAL_OVERFLOW_CONTRACT = CONTRACT;
export const AVANTIQO_INTELLIGENCE_MODAL_OVERFLOW_INFRASTRUCTURE = OVERFLOW_INFRASTRUCTURE;
export const AVANTIQO_INTELLIGENCE_MODAL_OVERFLOW_REASON_CODES = Object.freeze([...REASON_CODES]);
