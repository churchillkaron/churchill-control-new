import {
  assessOperatorIntelligencePlanWithEvidenceRevision,
  reviseOperatorIntelligencePlanWithEvidenceRevision,
} from "./OperatorIntelligenceEvidenceRevisionRuntime.js";

export const OPERATOR_INTELLIGENCE_RECOVERY_POLICY_CONTRACT =
  "AVANTIQO_OPERATOR_INTELLIGENCE_RECOVERY_POLICY_V1";

const GOVERNED_TOOL_OUTCOME_CONTRACT = "AVANTIQO_GOVERNED_TOOL_OUTCOME_V1";
const MAX_RETRY_BUDGET = 3;
const RETRYABLE_FAILURE_CODE_PATTERNS = [
  /(^|_)TIMEOUT($|_)/,
  /(^|_)RATE_LIMIT(?:ED)?($|_)/,
  /(^|_)TOO_MANY_REQUESTS($|_)/,
  /(^|_)SERVICE_UNAVAILABLE($|_)/,
  /(^|_)UPSTREAM_UNAVAILABLE($|_)/,
  /(^|_)CONNECTION_(?:RESET|TIMEOUT)($|_)/,
  /(^|_)NETWORK_(?:ERROR|RESET|TIMEOUT)($|_)/,
  /(^|_)TRANSIENT(?:_ERROR|_FAILURE)?($|_)/,
  /(^|_)TEMPORARY_(?:UNAVAILABLE|FAILURE)($|_)/,
];
const NON_RETRYABLE_GOVERNANCE_CODE_PATTERN =
  /(^|_)(AUTH(?:ORIZATION)?|PERMISSION|APPROVAL|CONFIRMATION|VALIDATION|INVALID|FORBIDDEN|DENIED|SCOPE|REQUIRED|WALLET|BUDGET|PAYMENT|INSUFFICIENT|UNKNOWN|NOT_EXPOSED|NOT_ALLOWED|POLICY)(_|$)/;

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, Math.min(maximum, parsed));
}

function normalizedFailureCode(value) {
  return text(value, 240)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function retryableFailureCode(code) {
  const normalized = normalizedFailureCode(code);
  if (!normalized || NON_RETRYABLE_GOVERNANCE_CODE_PATTERN.test(normalized)) {
    return false;
  }
  return RETRYABLE_FAILURE_CODE_PATTERNS.some((pattern) => pattern.test(normalized));
}

function stepIndex(plan = {}) {
  return new Map(
    list(object(plan).steps)
      .map((value) => object(value))
      .map((step) => {
        const id = text(step.id, 120);
        const kind = text(step.kind || step.type, 80).toLowerCase();
        return [id, {
          id,
          kind,
          capability_key: text(step.capability_key, 300) || null,
          mutates: step.mutates === true || kind === "action_candidate",
          retry_budget: boundedInteger(step.retry_budget, kind === "action_candidate" ? 0 : 1, 0, MAX_RETRY_BUDGET),
        }];
      })
      .filter(([id]) => id),
  );
}

function normalizedFailureObservation(value = {}) {
  const source = object(value);
  const status = text(source.status, 60).toLowerCase();
  const isFailure = status === "failed" || status === "blocked";
  const rawAttempts = boundedInteger(source.attempts, 0, 0, 20);
  return {
    step_id: text(source.step_id || source.id, 120),
    status,
    tool_call_id: text(source.tool_call_id || source.toolCallId, 240) || null,
    claimed_failure_code: normalizedFailureCode(
      source.failure_code || source.error_code || source.code,
    ) || null,
    attempts: isFailure ? Math.max(1, rawAttempts) : rawAttempts,
  };
}

function normalizedGovernedOutcome(value = {}) {
  const source = object(value);
  return {
    contract: text(source.contract, 160) || null,
    tool_call_id: text(source.tool_call_id, 240) || null,
    tool_name: text(source.tool_name, 120) || null,
    binding_key: text(source.binding_key, 300) || null,
    outcome: text(source.outcome, 40).toLowerCase(),
    code: normalizedFailureCode(source.code) || null,
    mutates: typeof source.mutates === "boolean" ? source.mutates : null,
    raw_result_persisted: source.raw_result_persisted === true,
    raw_error_persisted: source.raw_error_persisted === true,
  };
}

function governedOutcomeIndex(values = []) {
  const byCallId = new Map();
  for (const raw of list(values)) {
    const receipt = normalizedGovernedOutcome(raw);
    if (!receipt.tool_call_id) continue;
    byCallId.set(receipt.tool_call_id, receipt);
  }
  return byCallId;
}

function attestedFailure(step, observation, receipt) {
  if (!observation.tool_call_id) {
    return { trusted: false, reason: "GOVERNED_TOOL_CALL_ID_REQUIRED", code: null };
  }
  if (!receipt) {
    return { trusted: false, reason: "GOVERNED_TOOL_OUTCOME_NOT_FOUND", code: null };
  }
  if (receipt.contract !== GOVERNED_TOOL_OUTCOME_CONTRACT) {
    return { trusted: false, reason: "GOVERNED_TOOL_OUTCOME_CONTRACT_INVALID", code: null };
  }
  if (receipt.raw_result_persisted || receipt.raw_error_persisted) {
    return { trusted: false, reason: "GOVERNED_TOOL_OUTCOME_UNSAFE", code: null };
  }
  if (!step.capability_key) {
    return { trusted: false, reason: "STEP_CAPABILITY_BINDING_REQUIRED", code: null };
  }
  if (receipt.binding_key !== step.capability_key) {
    return { trusted: false, reason: "GOVERNED_TOOL_OUTCOME_BINDING_MISMATCH", code: null };
  }
  if (receipt.outcome === "blocked") {
    return { trusted: true, reason: "GOVERNED_TOOL_OUTCOME_BLOCKED", code: receipt.code };
  }
  if (receipt.outcome !== "failed") {
    return { trusted: false, reason: "GOVERNED_TOOL_OUTCOME_NOT_FAILURE", code: null };
  }
  if (!receipt.code) {
    return { trusted: false, reason: "GOVERNED_FAILURE_CODE_MISSING", code: null };
  }
  return {
    trusted: true,
    reason: "GOVERNED_FAILURE_ATTESTED",
    code: receipt.code,
  };
}

function recoveryDecision(step, observation, receipt) {
  const sourceStep = object(step);
  const sourceObservation = object(observation);
  const retryBudget = boundedInteger(sourceStep.retry_budget, 0, 0, MAX_RETRY_BUDGET);
  const attempts = boundedInteger(sourceObservation.attempts, 1, 1, 20);
  const consumedRetries = Math.max(0, attempts - 1);
  const remainingRetries = Math.max(0, retryBudget - consumedRetries);
  const attestation = attestedFailure(sourceStep, sourceObservation, receipt);
  const base = {
    step_id: text(sourceObservation.step_id, 120),
    status: text(sourceObservation.status, 60).toLowerCase(),
    tool_call_id: text(sourceObservation.tool_call_id, 240) || null,
    claimed_failure_code: normalizedFailureCode(sourceObservation.claimed_failure_code) || null,
    failure_code: normalizedFailureCode(attestation.code) || null,
    failure_code_attested: attestation.trusted === true,
    governed_outcome_reason: attestation.reason,
    attempts,
    retry_budget: retryBudget,
    remaining_retries: remainingRetries,
    retry_allowed: false,
    requires_replan: true,
    reason: null,
  };

  if (base.status === "blocked" || attestation.reason === "GOVERNED_TOOL_OUTCOME_BLOCKED") {
    return {
      ...base,
      reason: "BLOCKED_FAILURE_REQUIRES_REPLAN",
    };
  }
  if (sourceStep.mutates === true) {
    return {
      ...base,
      reason: "MUTATING_STEP_NEVER_AUTO_RETRIED",
    };
  }
  if (retryBudget <= 0) {
    return {
      ...base,
      reason: "RETRY_BUDGET_NOT_CONFIGURED",
    };
  }
  if (!attestation.trusted) {
    return {
      ...base,
      reason: attestation.reason,
    };
  }
  if (!retryableFailureCode(base.failure_code)) {
    return {
      ...base,
      reason: base.failure_code
        ? "FAILURE_CODE_NOT_RETRYABLE"
        : "FAILURE_CODE_REQUIRED_FOR_SAFE_RETRY",
    };
  }
  if (remainingRetries <= 0) {
    return {
      ...base,
      reason: "RETRY_BUDGET_EXHAUSTED",
    };
  }

  return {
    ...base,
    retry_allowed: true,
    requires_replan: false,
    reason: "ATTESTED_TRANSIENT_NON_MUTATING_FAILURE_RETRY_ALLOWED",
  };
}

function recoveryDecisions(plan = {}, observations = [], governedToolOutcomes = []) {
  const byStep = stepIndex(plan);
  const byCallId = governedOutcomeIndex(governedToolOutcomes);
  return list(observations)
    .map(normalizedFailureObservation)
    .filter((observation) =>
      observation.step_id &&
      (observation.status === "failed" || observation.status === "blocked"),
    )
    .map((observation) => {
      const step = byStep.get(observation.step_id) || {
        id: observation.step_id,
        kind: "unknown",
        capability_key: null,
        mutates: true,
        retry_budget: 0,
      };
      const receipt = observation.tool_call_id
        ? byCallId.get(observation.tool_call_id) || null
        : null;
      return recoveryDecision(step, observation, receipt);
    })
    .slice(0, 18);
}

function recoveryGovernance(base = {}) {
  return {
    ...object(base),
    retry_policy_is_deterministic: true,
    retries_are_bounded: true,
    only_known_transient_codes_may_retry: true,
    retry_failure_codes_require_governed_attestation: true,
    model_failure_codes_never_authorize_retry: true,
    tool_call_binding_required_for_retry: true,
    capability_binding_required_for_retry: true,
    unknown_failures_never_auto_retry: true,
    blocked_failures_never_auto_retry: true,
    mutating_steps_never_auto_retry: true,
    governance_failures_never_auto_retry: true,
    raw_tool_results_persisted_for_recovery: false,
    raw_tool_errors_persisted_for_recovery: false,
    raw_reasoning_persisted: false,
  };
}

export function assessOperatorIntelligencePlanWithRecoveryPolicy({
  plan = {},
  observations = [],
  governed_tool_outcomes = [],
} = {}) {
  const base = assessOperatorIntelligencePlanWithEvidenceRevision({
    plan,
    observations,
  });
  const decisions = recoveryDecisions(plan, observations, governed_tool_outcomes);
  const retryable = decisions.filter((decision) => decision.retry_allowed === true);
  const nonRetryable = decisions.filter((decision) => decision.retry_allowed !== true);
  const evidenceInvalidated = list(base.plan_invalidations).length > 0;
  const retryOwnsCurrentState = Boolean(
    retryable.length > 0 &&
    nonRetryable.length === 0 &&
    !evidenceInvalidated &&
    base.completion_proven !== true,
  );

  if (retryOwnsCurrentState) {
    return {
      ...base,
      recovery_policy_contract: OPERATOR_INTELLIGENCE_RECOVERY_POLICY_CONTRACT,
      governed_tool_outcome_contract: GOVERNED_TOOL_OUTCOME_CONTRACT,
      status: "RETRY_REQUIRED",
      completion_proven: false,
      requires_replan: false,
      retry_required: true,
      retry_step_ids: retryable.map((decision) => decision.step_id),
      recovery_decisions: decisions,
      deferred_blocked_steps: list(base.blocked_steps),
      replan_triggers: list(base.replan_triggers).filter(
        (trigger) => !["execution_failure", "blocked_dependency"].includes(trigger),
      ),
      recovery_triggers: ["attested_retryable_transient_failure"],
      governance: recoveryGovernance(base.governance),
    };
  }

  return {
    ...base,
    recovery_policy_contract: OPERATOR_INTELLIGENCE_RECOVERY_POLICY_CONTRACT,
    governed_tool_outcome_contract: GOVERNED_TOOL_OUTCOME_CONTRACT,
    retry_required: false,
    retry_step_ids: [],
    recovery_decisions: decisions,
    recovery_triggers: [],
    governance: recoveryGovernance(base.governance),
  };
}

export function reviseOperatorIntelligencePlanWithRecoveryPolicy({
  plan = {},
  revised_steps = [],
  observations = [],
  governed_tool_outcomes = [],
  replan_reason = null,
} = {}) {
  const assessment = assessOperatorIntelligencePlanWithRecoveryPolicy({
    plan,
    observations,
    governed_tool_outcomes,
  });

  if (assessment.retry_required === true) {
    return {
      status: "REPLAN_DEFERRED_RETRY_REQUIRED",
      plan: object(plan),
      assessment,
      blocked: false,
      retry_step_ids: assessment.retry_step_ids,
      recovery_policy_contract: OPERATOR_INTELLIGENCE_RECOVERY_POLICY_CONTRACT,
      governed_tool_outcome_contract: GOVERNED_TOOL_OUTCOME_CONTRACT,
    };
  }

  const revised = reviseOperatorIntelligencePlanWithEvidenceRevision({
    plan,
    revised_steps,
    observations,
    replan_reason,
  });
  return {
    ...revised,
    recovery_policy_contract: OPERATOR_INTELLIGENCE_RECOVERY_POLICY_CONTRACT,
    governed_tool_outcome_contract: GOVERNED_TOOL_OUTCOME_CONTRACT,
  };
}

export const OperatorIntelligenceRecoveryPolicyRuntime = Object.freeze({
  contract: OPERATOR_INTELLIGENCE_RECOVERY_POLICY_CONTRACT,
  governedOutcomeContract: GOVERNED_TOOL_OUTCOME_CONTRACT,
  assess: assessOperatorIntelligencePlanWithRecoveryPolicy,
  revise: reviseOperatorIntelligencePlanWithRecoveryPolicy,
  retryableFailureCode,
});
