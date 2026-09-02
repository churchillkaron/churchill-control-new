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
  evaluate: evaluateOperatorRepairSupervision,
  failureReason: operatorRepairFailureReason,
  verificationFailed: operatorPostActionVerificationFailed,
  humanGate: operatorRepairReasonIsHumanGate,
});
