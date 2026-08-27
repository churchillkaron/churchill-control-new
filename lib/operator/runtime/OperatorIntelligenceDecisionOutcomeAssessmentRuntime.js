import {
  OPERATOR_INTELLIGENCE_DECISION_OUTCOME_CONTRACT,
} from "./OperatorIntelligenceDecisionOutcomeContractRuntime.js";

export const OPERATOR_INTELLIGENCE_DECISION_OUTCOME_ASSESSMENT_CONTRACT =
  "AVANTIQO_OPERATOR_INTELLIGENCE_DECISION_OUTCOME_ASSESSMENT_V1";

const MAX_OBSERVATIONS = 64;
const VERIFIED_STATUSES = new Set(["pass"]);
const COMPARATORS = new Set(["eq", "neq", "gt", "gte", "lt", "lte", "contains", "exists", "truthy", "falsy"]);

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function uniqueText(values, limit = 240) {
  const output = [];
  const seen = new Set();
  for (const value of list(values)) {
    const clean = text(value, limit);
    const key = clean.toLowerCase();
    if (!clean || seen.has(key)) continue;
    seen.add(key);
    output.push(clean);
  }
  return output;
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, stableValue(value[key])]),
    );
  }
  return value;
}

function valuesEqual(left, right) {
  if (Object.is(left, right)) return true;
  try {
    return JSON.stringify(stableValue(left)) === JSON.stringify(stableValue(right));
  } catch {
    return false;
  }
}

function normalizeSource(value) {
  return text(value, 240).toLowerCase();
}

function normalizeObservation(value = {}, index = 0) {
  const source = object(value);
  const verificationStatus = text(source.verification_status, 40).toLowerCase();
  const hasValue = Object.prototype.hasOwnProperty.call(source, "observed_value") ||
    Object.prototype.hasOwnProperty.call(source, "value");
  return {
    id: text(source.id, 160) || `observation-${index + 1}`,
    criterion_id: text(source.criterion_id, 160) || null,
    observation_source: text(source.observation_source || source.source, 240) || null,
    observed_value: Object.prototype.hasOwnProperty.call(source, "observed_value")
      ? source.observed_value
      : source.value,
    has_value: hasValue,
    verified: source.verified === true || VERIFIED_STATUSES.has(verificationStatus),
    verification_status: verificationStatus || null,
    current: source.current !== false && source.superseded !== true,
    superseded: source.superseded === true,
    observed_at: text(source.observed_at, 80) || null,
    evidence_ids: uniqueText(source.evidence_ids, 160).slice(0, 16),
  };
}

function evaluateComparator(comparator, observedValue, expectedValue, hasValue) {
  if (!COMPARATORS.has(comparator)) {
    return { evaluable: false, matched: null, issue: "OUTCOME_COMPARATOR_UNSUPPORTED" };
  }

  if (comparator === "exists") {
    return { evaluable: true, matched: hasValue && observedValue !== null && observedValue !== undefined, issue: null };
  }
  if (comparator === "truthy") {
    return { evaluable: true, matched: Boolean(observedValue), issue: null };
  }
  if (comparator === "falsy") {
    return { evaluable: true, matched: !Boolean(observedValue), issue: null };
  }
  if (!hasValue) {
    return { evaluable: false, matched: null, issue: "OBSERVED_VALUE_REQUIRED" };
  }
  if (comparator === "eq") {
    return { evaluable: true, matched: valuesEqual(observedValue, expectedValue), issue: null };
  }
  if (comparator === "neq") {
    return { evaluable: true, matched: !valuesEqual(observedValue, expectedValue), issue: null };
  }
  if (["gt", "gte", "lt", "lte"].includes(comparator)) {
    if (
      typeof observedValue !== "number" ||
      !Number.isFinite(observedValue) ||
      typeof expectedValue !== "number" ||
      !Number.isFinite(expectedValue)
    ) {
      return { evaluable: false, matched: null, issue: "NUMERIC_COMPARATOR_REQUIRES_FINITE_NUMBERS" };
    }
    if (comparator === "gt") return { evaluable: true, matched: observedValue > expectedValue, issue: null };
    if (comparator === "gte") return { evaluable: true, matched: observedValue >= expectedValue, issue: null };
    if (comparator === "lt") return { evaluable: true, matched: observedValue < expectedValue, issue: null };
    return { evaluable: true, matched: observedValue <= expectedValue, issue: null };
  }
  if (comparator === "contains") {
    if (typeof observedValue === "string") {
      if (typeof expectedValue !== "string") {
        return { evaluable: false, matched: null, issue: "STRING_CONTAINS_REQUIRES_STRING_EXPECTATION" };
      }
      return { evaluable: true, matched: observedValue.includes(expectedValue), issue: null };
    }
    if (Array.isArray(observedValue)) {
      return {
        evaluable: true,
        matched: observedValue.some((item) => valuesEqual(item, expectedValue)),
        issue: null,
      };
    }
    return { evaluable: false, matched: null, issue: "CONTAINS_REQUIRES_STRING_OR_ARRAY_OBSERVATION" };
  }

  return { evaluable: false, matched: null, issue: "OUTCOME_COMPARATOR_UNSUPPORTED" };
}

function assessCriterion(criterion = {}, observations = []) {
  const source = object(criterion);
  const criterionId = text(source.id, 160) || null;
  const expectedSource = normalizeSource(source.observation_source);
  const candidates = observations.filter((observation) => observation.criterion_id === criterionId);
  const verifiedCurrent = candidates.filter(
    (observation) => observation.verified && observation.current,
  );
  const exactSource = verifiedCurrent.filter(
    (observation) => normalizeSource(observation.observation_source) === expectedSource,
  );
  const evaluations = exactSource.map((observation) => ({
    observation,
    evaluation: evaluateComparator(
      text(source.comparator, 40).toLowerCase(),
      observation.observed_value,
      source.expected_value,
      observation.has_value,
    ),
  }));
  const validEvaluations = evaluations.filter((row) => row.evaluation.evaluable);
  const matchedCount = validEvaluations.filter((row) => row.evaluation.matched === true).length;
  const nonMatchedCount = validEvaluations.filter((row) => row.evaluation.matched === false).length;
  const issues = [];

  if (candidates.length === 0) issues.push("OBSERVATION_MISSING");
  else if (verifiedCurrent.length === 0) issues.push("VERIFIED_CURRENT_OBSERVATION_REQUIRED");
  else if (exactSource.length === 0) issues.push("OBSERVATION_SOURCE_MISMATCH");

  for (const row of evaluations) {
    if (!row.evaluation.evaluable && row.evaluation.issue) issues.push(row.evaluation.issue);
  }
  if (matchedCount > 0 && nonMatchedCount > 0) {
    issues.push("CONFLICTING_VERIFIED_OBSERVATIONS");
  }

  let status = "INCONCLUSIVE";
  let matched = null;
  if (validEvaluations.length > 0 && matchedCount > 0 && nonMatchedCount === 0) {
    status = "SATISFIED";
    matched = true;
  } else if (validEvaluations.length > 0 && matchedCount === 0 && nonMatchedCount > 0) {
    status = "NOT_SATISFIED";
    matched = false;
  }

  return {
    id: criterionId,
    kind: text(source.kind, 40).toLowerCase() || null,
    required: source.required !== false,
    signal: text(source.signal, 500) || null,
    comparator: text(source.comparator, 40).toLowerCase() || null,
    expected_value: source.expected_value,
    observation_source: text(source.observation_source, 240) || null,
    status,
    matched,
    observation_count: candidates.length,
    verified_current_observation_count: verifiedCurrent.length,
    exact_source_observation_count: exactSource.length,
    matched_observation_ids: validEvaluations
      .filter((row) => row.evaluation.matched === true)
      .map((row) => row.observation.id),
    non_matched_observation_ids: validEvaluations
      .filter((row) => row.evaluation.matched === false)
      .map((row) => row.observation.id),
    evidence_ids: uniqueText(
      exactSource.flatMap((observation) => observation.evidence_ids),
      160,
    ).slice(0, 24),
    issues: [...new Set(issues)],
  };
}

export function assessOperatorIntelligenceDecisionOutcome({
  outcome_contract = {},
  observations = [],
} = {}) {
  const contract = object(outcome_contract);
  const normalizedObservations = list(observations)
    .slice(0, MAX_OBSERVATIONS)
    .map(normalizeObservation);
  const contractReady =
    contract.contract === OPERATOR_INTELLIGENCE_DECISION_OUTCOME_CONTRACT &&
    contract.status === "OUTCOME_CONTRACT_READY" &&
    contract.outcome_contract_ready === true;
  const criterionResults = list(contract.criteria).map((criterion) =>
    assessCriterion(criterion, normalizedObservations),
  );

  const requiredResults = criterionResults.filter((criterion) => criterion.required);
  const successResults = criterionResults.filter((criterion) => criterion.kind === "success");
  const warningResults = criterionResults.filter((criterion) => criterion.kind === "warning");
  const failureResults = criterionResults.filter((criterion) => criterion.kind === "failure");
  const requiredSuccessResults = successResults.filter((criterion) => criterion.required);
  const requiredWarningResults = warningResults.filter((criterion) => criterion.required);
  const requiredFailureResults = failureResults.filter((criterion) => criterion.required);

  const failureTriggered = failureResults.some((criterion) => criterion.status === "SATISFIED");
  const warningTriggered = warningResults.some((criterion) => criterion.status === "SATISFIED");
  const allRequiredSuccessSatisfied =
    requiredSuccessResults.length > 0 &&
    requiredSuccessResults.every((criterion) => criterion.status === "SATISFIED");
  const allRequiredFailureCleared = requiredFailureResults.every(
    (criterion) => criterion.status === "NOT_SATISFIED",
  );
  const allRequiredWarningsCleared = requiredWarningResults.every(
    (criterion) => criterion.status === "NOT_SATISFIED",
  );
  const allRequiredCriteriaConclusive = requiredResults.every(
    (criterion) => criterion.status !== "INCONCLUSIVE",
  );

  let status = "OUTCOME_CONTRACT_NOT_READY";
  let outcome = null;
  let nextAction = "BUILD_A_READY_OUTCOME_CONTRACT_BEFORE_ASSESSMENT";
  let decisionSuccessProven = false;

  if (contractReady) {
    if (failureTriggered) {
      status = "OUTCOME_FAILED";
      outcome = "failure";
      nextAction = "REVIEW_FAILED_DECISION_AGAINST_CURRENT_PROVENANCE_CONTINGENCY_AND_GOVERNANCE";
    } else if (warningTriggered) {
      status = "OUTCOME_WARNING";
      outcome = "warning";
      nextAction = "REVIEW_WARNING_BEFORE_CLAIMING_DECISION_SUCCESS";
    } else if (
      allRequiredCriteriaConclusive &&
      allRequiredSuccessSatisfied &&
      allRequiredFailureCleared &&
      allRequiredWarningsCleared
    ) {
      status = "OUTCOME_SUCCEEDED";
      outcome = "success";
      nextAction = "PRESERVE_VERIFIED_OUTCOME_EVIDENCE_WITHOUT_GRANTING_NEW_EXECUTION_OR_LEARNING_AUTHORITY";
      decisionSuccessProven = true;
    } else {
      status = "OUTCOME_INCONCLUSIVE";
      outcome = "inconclusive";
      nextAction = "COLLECT_OR_RECONCILE_REQUIRED_VERIFIED_OUTCOME_OBSERVATIONS";
    }
  }

  const reviewPolicy = object(contract.review_policy);
  const reviewRequired =
    (status === "OUTCOME_FAILED" && reviewPolicy.review_on_failure === true) ||
    (status === "OUTCOME_WARNING" && reviewPolicy.review_on_warning === true);

  return {
    success: true,
    contract: OPERATOR_INTELLIGENCE_DECISION_OUTCOME_ASSESSMENT_CONTRACT,
    outcome_contract_contract: text(contract.contract, 160) || null,
    outcome_contract_ready: contractReady,
    status,
    outcome,
    decision_success_proven: decisionSuccessProven,
    completion_proven: false,
    review_required: reviewRequired,
    next_action: nextAction,
    criterion_results: criterionResults,
    satisfied_success_criterion_ids: successResults
      .filter((criterion) => criterion.status === "SATISFIED")
      .map((criterion) => criterion.id),
    triggered_warning_criterion_ids: warningResults
      .filter((criterion) => criterion.status === "SATISFIED")
      .map((criterion) => criterion.id),
    triggered_failure_criterion_ids: failureResults
      .filter((criterion) => criterion.status === "SATISFIED")
      .map((criterion) => criterion.id),
    inconclusive_criterion_ids: criterionResults
      .filter((criterion) => criterion.status === "INCONCLUSIVE")
      .map((criterion) => criterion.id),
    assessment_policy: {
      only_verified_current_exact_source_observations_can_decide_criteria: true,
      failure_evidence_dominates_success_evidence: true,
      warning_evidence_blocks_success_claim: true,
      all_required_success_criteria_must_be_verified: true,
      all_required_failure_criteria_must_be_verified_clear_before_success: true,
      all_required_warning_criteria_must_be_verified_clear_before_success: true,
      conflicting_verified_observations_never_produce_success: true,
      numeric_comparators_never_coerce_strings_to_numbers: true,
      model_numeric_outcome_scores_are_not_proof: true,
      freeform_model_judgment_is_not_outcome_verification: true,
      outcome_success_is_not_plan_completion: true,
      outcome_success_is_not_execution_authority: true,
      outcome_assessment_does_not_promote_learning_state: true,
      outcome_assessment_does_not_trigger_recovery_automatically: true,
    },
    governance: {
      planning_and_verification_only: true,
      executes_tools: false,
      schedules_monitoring: false,
      authorizes_business_actions: false,
      triggers_recovery: false,
      grants_learning_promotion: false,
      outcome_assessment_is_not_execution_authority: true,
      outcome_assessment_is_not_completion_proof: true,
      current_permissions_confirmation_wallet_and_verification_still_apply: true,
      prior_approval_never_substitutes_for_current_governance: true,
      mutation_authority_added: false,
      learning_state_mutated: false,
      raw_reasoning_persisted: false,
    },
  };
}

export const OperatorIntelligenceDecisionOutcomeAssessmentRuntime = Object.freeze({
  contract: OPERATOR_INTELLIGENCE_DECISION_OUTCOME_ASSESSMENT_CONTRACT,
  assess: assessOperatorIntelligenceDecisionOutcome,
});
