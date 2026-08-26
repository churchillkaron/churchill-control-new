import {
  assessOperatorIntelligencePlanWithEvidenceRevision,
  reviseOperatorIntelligencePlanWithEvidenceRevision,
} from "./OperatorIntelligenceEvidenceRevisionRuntime.js";

export const OPERATOR_INTELLIGENCE_RECOVERY_POLICY_CONTRACT =
  "AVANTIQO_OPERATOR_INTELLIGENCE_RECOVERY_POLICY_V1";

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
    failure_code: normalizedFailureCode(
      source.failure_code || source.error_code || source.code,
    ) || null,
    attempts: isFailure ? Math.max(1, rawAttempts) : rawAttempts,
  };
}

function recoveryDecision(step, observation) {
  const sourceStep = object(step);
  const sourceObservation = object(observation);
  const retryBudget = boundedInteger(sourceStep.retry_budget, 0, 0, MAX_RETRY_BUDGET);
  const attempts = boundedInteger(sourceObservation.attempts, 1, 1, 20);
  const consumedRetries = Math.max(0, attempts - 1);
  const remainingRetries = Math.max(0, retryBudget - consumedRetries);
  const base = {
    step_id: text(sourceObservation.step_id, 120),
    status: text(sourceObservation.status, 60).toLowerCase(),
    failure_code: normalizedFailureCode(sourceObservation.failure_code) || null,
    attempts,
    retry_budget: retryBudget,
    remaining_retries: remainingRetries,
    retry_allowed: false,
    requires_replan: true,
    reason: null,
  };

  if (base.status === "blocked") {
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
    reason: "TRANSIENT_NON_MUTATING_FAILURE_RETRY_ALLOWED",
  };
}

function recoveryDecisions(plan = {}, observations = []) {
  const byStep = stepIndex(plan);
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
        mutates: true,
        retry_budget: 0,
      };
      return recoveryDecision(step, observation);
    })
    .slice(0, 18);
}

export function assessOperatorIntelligencePlanWithRecoveryPolicy({
  plan = {},
  observations = [],
} = {}) {
  const base = assessOperatorIntelligencePlanWithEvidenceRevision({
    plan,
    observations,
  });
  const decisions = recoveryDecisions(plan, observations);
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
      recovery_triggers: ["retryable_transient_failure"],
      governance: {
        ...object(base.governance),
        retry_policy_is_deterministic: true,
        retries_are_bounded: true,
        only_known_transient_codes_may_retry: true,
        unknown_failures_never_auto_retry: true,
        blocked_failures_never_auto_retry: true,
        mutating_steps_never_auto_retry: true,
        governance_failures_never_auto_retry: true,
        raw_reasoning_persisted: false,
      },
    };
  }

  return {
    ...base,
    recovery_policy_contract: OPERATOR_INTELLIGENCE_RECOVERY_POLICY_CONTRACT,
    retry_required: false,
    retry_step_ids: [],
    recovery_decisions: decisions,
    recovery_triggers: [],
    governance: {
      ...object(base.governance),
      retry_policy_is_deterministic: true,
      retries_are_bounded: true,
      only_known_transient_codes_may_retry: true,
      unknown_failures_never_auto_retry: true,
      blocked_failures_never_auto_retry: true,
      mutating_steps_never_auto_retry: true,
      governance_failures_never_auto_retry: true,
      raw_reasoning_persisted: false,
    },
  };
}

export function reviseOperatorIntelligencePlanWithRecoveryPolicy({
  plan = {},
  revised_steps = [],
  observations = [],
  replan_reason = null,
} = {}) {
  const assessment = assessOperatorIntelligencePlanWithRecoveryPolicy({
    plan,
    observations,
  });

  if (assessment.retry_required === true) {
    return {
      status: "REPLAN_DEFERRED_RETRY_REQUIRED",
      plan: object(plan),
      assessment,
      blocked: false,
      retry_step_ids: assessment.retry_step_ids,
      recovery_policy_contract: OPERATOR_INTELLIGENCE_RECOVERY_POLICY_CONTRACT,
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
  };
}

export const OperatorIntelligenceRecoveryPolicyRuntime = Object.freeze({
  contract: OPERATOR_INTELLIGENCE_RECOVERY_POLICY_CONTRACT,
  assess: assessOperatorIntelligencePlanWithRecoveryPolicy,
  revise: reviseOperatorIntelligencePlanWithRecoveryPolicy,
  retryableFailureCode,
});
