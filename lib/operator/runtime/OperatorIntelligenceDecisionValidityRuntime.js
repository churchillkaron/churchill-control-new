export const OPERATOR_INTELLIGENCE_DECISION_VALIDITY_CONTRACT =
  "AVANTIQO_OPERATOR_INTELLIGENCE_DECISION_VALIDITY_V1";

const MAX_DEPENDENCIES = 20;
const MAX_CONDITIONS = 16;
const VOLATILITY_MAX_AGE_MS = Object.freeze({
  transactional: 60_000,
  dynamic: 15 * 60_000,
  slow: 24 * 60 * 60_000,
  stable: 7 * 24 * 60 * 60_000,
  unknown: 0,
});
const VALID_CONDITION_STATUS = new Set(["satisfied", "changed", "unknown"]);

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, Math.min(maximum, parsed));
}

function normalizedVolatility(value) {
  const clean = text(value, 40).toLowerCase();
  return Object.prototype.hasOwnProperty.call(VOLATILITY_MAX_AGE_MS, clean)
    ? clean
    : "unknown";
}

function parseTime(value) {
  const clean = text(value, 120);
  if (!clean) return null;
  const parsed = Date.parse(clean);
  return Number.isFinite(parsed) ? parsed : null;
}

function policyAgeMs({ volatility, requestedMaxAgeMs }) {
  const policyMaximum = VOLATILITY_MAX_AGE_MS[volatility] ?? 0;
  if (policyMaximum <= 0) return 0;
  const requested = boundedInteger(requestedMaxAgeMs, policyMaximum, 0, policyMaximum);
  return Math.min(requested, policyMaximum);
}

function normalizeDependency(value = {}, index = 0, nowMs) {
  const source = object(value);
  const volatility = normalizedVolatility(source.volatility);
  const observedAtMs = parseTime(source.observed_at || source.observedAt);
  const maxAgeMs = policyAgeMs({
    volatility,
    requestedMaxAgeMs: source.max_age_ms ?? source.maxAgeMs,
  });
  const ageMs = observedAtMs === null ? null : Math.max(0, nowMs - observedAtMs);
  const futureDated = observedAtMs !== null && observedAtMs > nowMs + 5_000;
  const stale = maxAgeMs === 0 || observedAtMs === null || futureDated || ageMs > maxAgeMs;
  const verified = source.verified === true;
  const current = source.current !== false;
  const superseded = source.superseded === true;
  const required = source.required !== false;

  const issues = [];
  if (required && !verified) issues.push("DEPENDENCY_UNVERIFIED");
  if (required && !current) issues.push("DEPENDENCY_NOT_CURRENT");
  if (required && superseded) issues.push("DEPENDENCY_SUPERSEDED");
  if (required && observedAtMs === null) issues.push("DEPENDENCY_OBSERVED_AT_REQUIRED");
  if (required && futureDated) issues.push("DEPENDENCY_FUTURE_TIMESTAMP_INVALID");
  if (required && volatility === "unknown") issues.push("DEPENDENCY_VOLATILITY_REQUIRED");
  if (required && stale) issues.push("DEPENDENCY_STALE");

  return {
    id: text(source.id || source.evidence_id, 160) || `dependency-${index + 1}`,
    source_kind: text(source.source_kind || source.kind, 80) || null,
    required,
    verified,
    current,
    superseded,
    volatility,
    observed_at: observedAtMs === null ? null : new Date(observedAtMs).toISOString(),
    age_ms: ageMs,
    policy_max_age_ms: maxAgeMs,
    stale,
    valid: issues.length === 0,
    issues,
  };
}

function normalizeCondition(value = {}, index = 0, nowMs) {
  const source = object(value);
  const statusCandidate = text(source.status, 40).toLowerCase();
  const status = VALID_CONDITION_STATUS.has(statusCandidate) ? statusCandidate : "unknown";
  const volatility = normalizedVolatility(source.volatility);
  const observedAtMs = parseTime(source.observed_at || source.observedAt);
  const maxAgeMs = policyAgeMs({
    volatility,
    requestedMaxAgeMs: source.max_age_ms ?? source.maxAgeMs,
  });
  const ageMs = observedAtMs === null ? null : Math.max(0, nowMs - observedAtMs);
  const futureDated = observedAtMs !== null && observedAtMs > nowMs + 5_000;
  const stale = maxAgeMs === 0 || observedAtMs === null || futureDated || ageMs > maxAgeMs;
  const verified = source.verified === true;
  const required = source.required !== false;

  const issues = [];
  if (required && status === "changed" && verified) {
    issues.push("VERIFIED_CONDITION_CHANGED");
  } else {
    if (required && status !== "satisfied") issues.push("CONDITION_NOT_SATISFIED");
    if (required && !verified) issues.push("CONDITION_UNVERIFIED");
    if (required && observedAtMs === null) issues.push("CONDITION_OBSERVED_AT_REQUIRED");
    if (required && futureDated) issues.push("CONDITION_FUTURE_TIMESTAMP_INVALID");
    if (required && volatility === "unknown") issues.push("CONDITION_VOLATILITY_REQUIRED");
    if (required && stale) issues.push("CONDITION_STALE");
  }

  return {
    id: text(source.id || source.condition_id, 160) || `condition-${index + 1}`,
    title: text(source.title || source.description, 500) || null,
    required,
    verified,
    status,
    volatility,
    observed_at: observedAtMs === null ? null : new Date(observedAtMs).toISOString(),
    age_ms: ageMs,
    policy_max_age_ms: maxAgeMs,
    stale,
    valid: issues.length === 0,
    issues,
  };
}

function normalizeDecision(value = {}) {
  const source = object(value);
  const selected = object(source.selected_candidate);
  return {
    candidate_id: text(source.candidate_id || selected.id, 160) || null,
    status: text(source.status, 80) || null,
    decided_at: text(source.decided_at || source.decidedAt, 120) || null,
  };
}

export function assessOperatorIntelligenceDecisionValidity({
  decision = {},
  evidence_dependencies = [],
  validity_conditions = [],
  now = null,
} = {}) {
  const nowMs = parseTime(now) ?? Date.now();
  const normalizedDecision = normalizeDecision(decision);
  const dependencies = list(evidence_dependencies)
    .slice(0, MAX_DEPENDENCIES)
    .map((item, index) => normalizeDependency(item, index, nowMs));
  const conditions = list(validity_conditions)
    .slice(0, MAX_CONDITIONS)
    .map((item, index) => normalizeCondition(item, index, nowMs));

  const requiredDependencies = dependencies.filter((item) => item.required);
  const requiredConditions = conditions.filter((item) => item.required);
  const verifiedChangedConditions = requiredConditions.filter((item) =>
    item.issues.includes("VERIFIED_CONDITION_CHANGED"),
  );
  const invalidDependencies = requiredDependencies.filter((item) => !item.valid);
  const invalidConditions = requiredConditions.filter((item) => !item.valid);

  let status = "VALIDITY_NOT_ESTABLISHED";
  let decisionValidNow = false;
  let requiresRevalidation = true;
  let requiresReplan = false;
  let nextAction = "REGISTER_CURRENT_DECISION_EVIDENCE_AND_VALIDITY_CONDITIONS";

  if (!normalizedDecision.candidate_id) {
    status = "DECISION_SELECTION_REQUIRED";
    nextAction = "DELIBERATE_BEFORE_VALIDITY_ASSESSMENT";
  } else if (verifiedChangedConditions.length > 0) {
    status = "INVALIDATED_BY_VERIFIED_CHANGE";
    requiresReplan = true;
    nextAction = "REPLAN_FROM_VERIFIED_CHANGED_CONDITION";
  } else if (!requiredDependencies.length && !requiredConditions.length) {
    status = "VALIDITY_NOT_ESTABLISHED";
  } else if (invalidDependencies.length > 0 || invalidConditions.length > 0) {
    status = "REVALIDATION_REQUIRED";
    nextAction = "REFRESH_STALE_OR_UNVERIFIED_DECISION_DEPENDENCIES";
  } else {
    status = "VALID_WITHIN_POLICY";
    decisionValidNow = true;
    requiresRevalidation = false;
    nextAction = "DECISION_REMAINS_PLANNING_ONLY_UNTIL_NORMAL_GOVERNANCE_EXECUTION";
  }

  return {
    success: true,
    contract: OPERATOR_INTELLIGENCE_DECISION_VALIDITY_CONTRACT,
    assessed_at: new Date(nowMs).toISOString(),
    status,
    decision: normalizedDecision,
    decision_valid_now: decisionValidNow,
    requires_revalidation: requiresRevalidation,
    requires_replan: requiresReplan,
    next_action: nextAction,
    evidence_dependency_count: dependencies.length,
    invalid_evidence_dependency_count: invalidDependencies.length,
    validity_condition_count: conditions.length,
    invalid_validity_condition_count: invalidConditions.length,
    verified_changed_condition_ids: verifiedChangedConditions.map((item) => item.id),
    evidence_dependencies: dependencies,
    validity_conditions: conditions,
    freshness_policy: {
      transactional_max_age_ms: VOLATILITY_MAX_AGE_MS.transactional,
      dynamic_max_age_ms: VOLATILITY_MAX_AGE_MS.dynamic,
      slow_max_age_ms: VOLATILITY_MAX_AGE_MS.slow,
      stable_max_age_ms: VOLATILITY_MAX_AGE_MS.stable,
      unknown_volatility_fails_closed: true,
      caller_max_age_can_only_tighten_policy: true,
    },
    governance: {
      planning_only: true,
      executes_tools: false,
      authorizes_business_actions: false,
      prior_recommendation_never_authorizes_execution: true,
      prior_approval_never_substitutes_for_current_governance: true,
      stale_or_unverified_dependencies_require_revalidation: true,
      verified_changed_conditions_require_replan: true,
      decision_validity_is_not_completion_proof: true,
      learning_state_mutated: false,
      raw_reasoning_persisted: false,
    },
  };
}

export const OperatorIntelligenceDecisionValidityRuntime = Object.freeze({
  contract: OPERATOR_INTELLIGENCE_DECISION_VALIDITY_CONTRACT,
  assess: assessOperatorIntelligenceDecisionValidity,
});
