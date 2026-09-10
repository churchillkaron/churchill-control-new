const HUMAN_GATES = new Set([
  "CONFIRMATION_REQUIRED",
  "VOICE_CONFIRMATION_REQUIRED",
  "APPROVAL_REQUIRED",
  "APPROVAL_PENDING",
  "APPROVAL_REQUESTED",
  "APPROVAL_REJECTED",
  "INSUFFICIENT_WALLET_BALANCE",
  "OPERATOR_ENTITY_CONTEXT_REQUIRED",
  "ENTITY_CONTEXT_REQUIRED",
  "PERMISSION_REQUIRED",
  "UNAUTHORIZED",
  "FORBIDDEN",
]);

const FAILED_EXECUTION_STATUSES = new Set(["failed", "blocked"]);

const RECOVERY_CLASSIFICATIONS = Object.freeze({
  HUMAN_GATE: "HUMAN_GATE",
  VERIFICATION_ONLY: "VERIFICATION_ONLY",
  DATA_OR_CLARIFICATION: "DATA_OR_CLARIFICATION",
  CONFIGURATION_OR_EXTERNAL: "CONFIGURATION_OR_EXTERNAL",
  TRANSIENT_RUNTIME: "TRANSIENT_RUNTIME",
  PRODUCT_DEFECT_CANDIDATE: "PRODUCT_DEFECT_CANDIDATE",
});

function recoveryEvidenceText(result = {}) {
  const execution = object(result.execution);
  const evidence = object(execution.failure_evidence);
  return [
    operatorRepairFailureReason(result),
    evidence.error_code,
    evidence.error_class,
    evidence.status_code,
    execution.capability?.key,
  ]
    .map((value) => text(value, 500))
    .filter(Boolean)
    .join(" ")
    .toUpperCase();
}

export function classifyOperatorFailureRecovery(result = {}) {
  const reason = operatorRepairFailureReason(result);
  if (operatorRepairReasonIsHumanGate(reason)) {
    return { classification: RECOVERY_CLASSIFICATIONS.HUMAN_GATE, code_engineering_candidate: false };
  }
  if (operatorPostActionVerificationFailed(result)) {
    return { classification: RECOVERY_CLASSIFICATIONS.VERIFICATION_ONLY, code_engineering_candidate: false };
  }

  const evidence = recoveryEvidenceText(result);
  const statusCode = Number(object(result.execution).failure_evidence?.status_code || 0);
  if (statusCode === 400 || statusCode === 422 || /VALIDATION|INVALID_INPUT|REQUIRED_FIELD|MISSING_INPUT|AMBIGUOUS|CLARIFICATION|UNMATCHED|UNKNOWN_/.test(evidence)) {
    return { classification: RECOVERY_CLASSIFICATIONS.DATA_OR_CLARIFICATION, code_engineering_candidate: false };
  }
  if (statusCode === 401 || statusCode === 403 || /CONFIG|CREDENTIAL|OAUTH|TOKEN|SECRET|QUOTA|RATE_LIMIT|PROVIDER.*UNAVAILABLE|EXTERNAL.*UNAVAILABLE|CONNECTION_REQUIRED/.test(evidence)) {
    return { classification: RECOVERY_CLASSIFICATIONS.CONFIGURATION_OR_EXTERNAL, code_engineering_candidate: false };
  }
  if ([429, 502, 503, 504].includes(statusCode) || /TIMEOUT|ECONNRESET|ECONNREFUSED|TEMPORAR|TRANSIENT|503|502|504|DEADLOCK|LOCK_TIMEOUT/.test(evidence)) {
    return { classification: RECOVERY_CLASSIFICATIONS.TRANSIENT_RUNTIME, code_engineering_candidate: false };
  }
  return { classification: RECOVERY_CLASSIFICATIONS.PRODUCT_DEFECT_CANDIDATE, code_engineering_candidate: true };
}
const FAILED_VERIFICATION_STATUSES = new Set([
  "failed",
  "blocked",
  "error",
  "unavailable",
  "incomplete",
]);

function text(value, limit = 1200) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function normalizedStatus(value) {
  return text(value, 80).toLowerCase();
}

export function operatorRepairFailureReason(result = {}) {
  const execution = object(result.execution);
  const verification = object(execution.post_action_verification);

  return text(
    execution.reason ||
      execution.error ||
      execution.result?.reason ||
      execution.result?.error ||
      result.error ||
      verification.reason ||
      verification.error,
    1200,
  );
}

export function operatorPostActionVerificationFailed(result = {}) {
  const verification = object(result?.execution?.post_action_verification);
  return FAILED_VERIFICATION_STATUSES.has(
    normalizedStatus(verification.status),
  );
}

export function operatorRepairReasonIsHumanGate(reason) {
  const normalized = text(reason, 300).toUpperCase();
  if (!normalized) return false;
  if (HUMAN_GATES.has(normalized)) return true;

  return [
    "CONFIRMATION",
    "APPROVAL",
    "PERMISSION",
    "AUTHORIZATION",
    "WALLET",
    "BALANCE",
    "ENTITY_CONTEXT",
  ].some((token) => normalized.includes(token));
}

export function evaluateOperatorRepairSupervision(result = {}) {
  const executionStatus = normalizedStatus(result?.execution?.status);
  const executionFailed = FAILED_EXECUTION_STATUSES.has(executionStatus);
  const verificationFailed = operatorPostActionVerificationFailed(result);
  const failureReason = operatorRepairFailureReason(result);
  const humanGate = operatorRepairReasonIsHumanGate(failureReason);

  if (humanGate) {
    return {
      applicable: false,
      reason: "HUMAN_GOVERNANCE_GATE",
      failure_reason: failureReason || null,
      execution_failed: executionFailed,
      verification_failed: verificationFailed,
    };
  }

  if (!executionFailed && !verificationFailed) {
    return {
      applicable: false,
      reason: "NO_REPAIRABLE_FAILURE",
      failure_reason: failureReason || null,
      execution_failed: false,
      verification_failed: false,
    };
  }

  return {
    applicable: true,
    reason:
      verificationFailed && !executionFailed
        ? "POST_ACTION_VERIFICATION_FAILURE"
        : "TECHNICAL_OR_BUSINESS_FAILURE",
    failure_reason: failureReason || null,
    execution_failed: executionFailed,
    verification_failed: verificationFailed,
  };
}

export const OperatorRepairSupervisionPolicy = Object.freeze({
  classifyRecovery: classifyOperatorFailureRecovery,
  recoveryClassifications: RECOVERY_CLASSIFICATIONS,
  evaluate: evaluateOperatorRepairSupervision,
  failureReason: operatorRepairFailureReason,
  verificationFailed: operatorPostActionVerificationFailed,
  humanGate: operatorRepairReasonIsHumanGate,
});
