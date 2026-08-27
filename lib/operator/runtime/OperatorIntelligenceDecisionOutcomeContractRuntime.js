export const OPERATOR_INTELLIGENCE_DECISION_OUTCOME_CONTRACT =
  "AVANTIQO_OPERATOR_INTELLIGENCE_DECISION_OUTCOME_CONTRACT_V1";

const MAX_CRITERIA = 24;
const CRITERION_KINDS = new Set(["success", "warning", "failure"]);
const COMPARATORS = new Set(["eq", "neq", "gt", "gte", "lt", "lte", "contains", "exists", "truthy", "falsy"]);
const VALUE_OPTIONAL_COMPARATORS = new Set(["exists", "truthy", "falsy"]);
const REVIEW_TRIGGERS = new Set(["time", "milestone", "next_verified_observation", "before_completion"]);

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function uniqueText(values, limit = 400) {
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

function normalizeDecision(value = {}) {
  const source = object(value);
  const selected = object(source.selected_candidate);
  return {
    candidate_id: text(source.candidate_id || selected.id, 160) || null,
    mutates: source.mutates === true || selected.mutates === true,
    irreversible: source.irreversible === true || selected.irreversible === true,
    requires_human: source.requires_human === true || selected.requires_human === true,
  };
}

function normalizeCriterion(value = {}, index = 0) {
  const source = object(value);
  const rawKind = text(source.kind || source.type, 40).toLowerCase();
  const kind = CRITERION_KINDS.has(rawKind) ? rawKind : null;
  const rawComparator = text(source.comparator, 40).toLowerCase();
  const comparator = COMPARATORS.has(rawComparator) ? rawComparator : null;
  const hasExpectedValue = source.expected_value !== undefined || source.threshold !== undefined;
  const expectedValue = source.expected_value !== undefined ? source.expected_value : source.threshold;
  return {
    id: text(source.id, 160) || `outcome-${index + 1}`,
    kind,
    signal: text(source.signal || source.metric || source.statement, 500) || null,
    comparator,
    expected_value: hasExpectedValue ? expectedValue : null,
    unit: text(source.unit, 80) || null,
    observation_source: text(source.observation_source || source.source, 240) || null,
    verification_criteria: uniqueText(source.verification_criteria || source.verification, 500).slice(0, 10),
    failure_mode_ids: uniqueText(source.failure_mode_ids, 160).slice(0, 12),
    required: source.required !== false,
  };
}

function criterionIssues(criterion) {
  const issues = [];
  if (!criterion.kind) issues.push("OUTCOME_KIND_REQUIRED");
  if (!criterion.signal) issues.push("OBSERVABLE_SIGNAL_REQUIRED");
  if (!criterion.comparator) issues.push("VALID_COMPARATOR_REQUIRED");
  if (
    criterion.comparator &&
    !VALUE_OPTIONAL_COMPARATORS.has(criterion.comparator) &&
    criterion.expected_value === null
  ) {
    issues.push("EXPECTED_VALUE_REQUIRED");
  }
  if (!criterion.observation_source) issues.push("OBSERVATION_SOURCE_REQUIRED");
  if (criterion.verification_criteria.length === 0) issues.push("OUTCOME_VERIFICATION_CRITERIA_REQUIRED");
  return issues;
}

function criterionSignature(criterion) {
  return JSON.stringify([
    text(criterion.signal, 500).toLowerCase(),
    criterion.comparator,
    criterion.expected_value,
    text(criterion.unit, 80).toLowerCase(),
  ]);
}

function normalizeReviewPolicy(value = {}) {
  const source = object(value);
  const rawTrigger = text(source.planned_review_trigger || source.trigger, 80).toLowerCase();
  const plannedReviewTrigger = REVIEW_TRIGGERS.has(rawTrigger) ? rawTrigger : null;
  const reviewAfterMs = Number(source.review_after_ms);
  const boundedReviewAfterMs = Number.isFinite(reviewAfterMs) && reviewAfterMs > 0
    ? Math.floor(reviewAfterMs)
    : null;
  return {
    planned_review_trigger: plannedReviewTrigger,
    review_after_ms: boundedReviewAfterMs,
    review_at: text(source.review_at, 80) || null,
    milestone_id: text(source.milestone_id, 160) || null,
    review_on_warning: source.review_on_warning === true,
    review_on_failure: source.review_on_failure === true,
    review_on_invalidation_trigger: source.review_on_invalidation_trigger === true,
  };
}

function reviewIssues(review, decisionCritical) {
  const issues = [];
  if (decisionCritical && !review.planned_review_trigger) {
    issues.push("PLANNED_REVIEW_TRIGGER_REQUIRED");
  }
  if (review.planned_review_trigger === "time" && !review.review_after_ms && !review.review_at) {
    issues.push("TIME_REVIEW_BOUNDARY_REQUIRED");
  }
  if (review.planned_review_trigger === "milestone" && !review.milestone_id) {
    issues.push("REVIEW_MILESTONE_ID_REQUIRED");
  }
  if (decisionCritical && !review.review_on_failure) {
    issues.push("FAILURE_REVIEW_TRIGGER_REQUIRED");
  }
  if (decisionCritical && !review.review_on_invalidation_trigger) {
    issues.push("INVALIDATION_REVIEW_TRIGGER_REQUIRED");
  }
  return issues;
}

function requiredContingencyFailureModes(contingency = {}) {
  return list(object(contingency).failure_modes)
    .filter((item) => {
      const source = object(item);
      return source.decision_invalidating === true || ["high", "critical"].includes(text(source.severity, 40).toLowerCase());
    })
    .map((item) => text(object(item).id, 160))
    .filter(Boolean);
}

export function buildOperatorIntelligenceDecisionOutcomeContract({
  decision = {},
  criteria = [],
  review_policy = {},
  provenance = {},
  contingency = {},
  decision_critical = true,
} = {}) {
  const normalizedDecision = normalizeDecision(decision);
  const normalizedCriteria = list(criteria)
    .slice(0, MAX_CRITERIA)
    .map(normalizeCriterion)
    .map((criterion) => ({ ...criterion, issues: criterionIssues(criterion) }));
  const reviewPolicy = normalizeReviewPolicy(review_policy);
  const decisionCritical = decision_critical !== false;
  const issues = [];

  const duplicateIds = normalizedCriteria
    .map((criterion) => criterion.id)
    .filter((id, index, all) => all.indexOf(id) !== index);
  if (duplicateIds.length > 0) issues.push("DUPLICATE_OUTCOME_CRITERION_ID");

  const successCriteria = normalizedCriteria.filter((criterion) => criterion.kind === "success");
  const warningCriteria = normalizedCriteria.filter((criterion) => criterion.kind === "warning");
  const failureCriteria = normalizedCriteria.filter((criterion) => criterion.kind === "failure");

  if (decisionCritical && successCriteria.length === 0) issues.push("SUCCESS_CRITERION_REQUIRED");
  if (decisionCritical && failureCriteria.length === 0) issues.push("FAILURE_CRITERION_REQUIRED");
  if (normalizedCriteria.some((criterion) => criterion.issues.length > 0)) {
    issues.push("OUTCOME_CRITERION_GAPS");
  }

  const successSignatures = new Set(successCriteria.map(criterionSignature));
  if (failureCriteria.some((criterion) => successSignatures.has(criterionSignature(criterion)))) {
    issues.push("SUCCESS_FAILURE_CRITERIA_CONFLICT");
  }

  const reviewGapCodes = reviewIssues(reviewPolicy, decisionCritical);
  issues.push(...reviewGapCodes);

  const requiredFailureModeIds = requiredContingencyFailureModes(contingency);
  const mappedFailureModeIds = new Set(
    normalizedCriteria.flatMap((criterion) => criterion.failure_mode_ids),
  );
  const unmappedFailureModeIds = requiredFailureModeIds.filter((id) => !mappedFailureModeIds.has(id));
  if (unmappedFailureModeIds.length > 0) {
    issues.push("MATERIAL_CONTINGENCY_FAILURE_MODE_NOT_OUTCOME_MAPPED");
  }

  const provenanceTriggerCount = list(object(provenance).invalidation_triggers).length;
  if (decisionCritical && provenanceTriggerCount > 0 && !reviewPolicy.review_on_invalidation_trigger) {
    issues.push("PROVENANCE_INVALIDATION_REVIEW_REQUIRED");
  }

  let status = "DECISION_SELECTION_REQUIRED";
  let nextAction = "SELECT_A_DECISION_BEFORE_BUILDING_OUTCOME_CONTRACT";
  let outcomeContractReady = false;

  if (normalizedDecision.candidate_id) {
    if (normalizedCriteria.length === 0) {
      status = "OUTCOME_CONTRACT_REQUIRED";
      nextAction = "DECLARE_OBSERVABLE_SUCCESS_AND_FAILURE_CRITERIA";
    } else if (issues.length > 0) {
      status = "OUTCOME_CONTRACT_GAPS";
      nextAction = "CLOSE_OBSERVABILITY_VERIFICATION_MAPPING_AND_REVIEW_GAPS";
    } else {
      status = "OUTCOME_CONTRACT_READY";
      nextAction = normalizedDecision.mutates || normalizedDecision.irreversible
        ? "PRESERVE_OUTCOME_CONTRACT_FOR_CURRENT_HUMAN_OPERATOR_GOVERNANCE_AND_LATER_VERIFICATION"
        : "PRESERVE_OUTCOME_CONTRACT_FOR_LATER_VERIFIED_OUTCOME_ASSESSMENT";
      outcomeContractReady = true;
    }
  }

  return {
    success: true,
    contract: OPERATOR_INTELLIGENCE_DECISION_OUTCOME_CONTRACT,
    status,
    outcome_contract_ready: outcomeContractReady,
    next_action: nextAction,
    decision: normalizedDecision,
    decision_critical: decisionCritical,
    criteria: normalizedCriteria,
    success_criteria_ids: successCriteria.map((criterion) => criterion.id),
    warning_criteria_ids: warningCriteria.map((criterion) => criterion.id),
    failure_criteria_ids: failureCriteria.map((criterion) => criterion.id),
    required_contingency_failure_mode_ids: requiredFailureModeIds,
    unmapped_contingency_failure_mode_ids: unmappedFailureModeIds,
    review_policy: reviewPolicy,
    issues: [...new Set(issues)],
    outcome_policy: {
      outcome_contract_must_be_falsifiable: true,
      decision_critical_requires_success_and_failure_criteria: true,
      every_criterion_requires_observation_source: true,
      every_criterion_requires_verification_criteria: true,
      success_and_failure_cannot_use_identical_test: true,
      high_or_critical_contingency_failure_modes_must_map_to_outcome_criteria: true,
      decision_critical_requires_planned_review_trigger: true,
      decision_critical_requires_failure_review: true,
      known_provenance_invalidation_requires_review: true,
      model_numeric_outcome_scores_are_not_proof: true,
      freeform_model_judgment_is_not_outcome_verification: true,
      outcome_contract_readiness_is_not_outcome_success: true,
      outcome_contract_readiness_is_not_execution_authority: true,
    },
    governance: {
      planning_only: true,
      executes_tools: false,
      schedules_monitoring: false,
      authorizes_business_actions: false,
      outcome_contract_is_not_execution_authority: true,
      outcome_contract_is_not_completion_proof: true,
      outcome_contract_does_not_claim_success: true,
      current_permissions_confirmation_wallet_and_verification_still_apply: true,
      prior_approval_never_substitutes_for_current_governance: true,
      mutation_authority_added: false,
      learning_state_mutated: false,
      raw_reasoning_persisted: false,
    },
  };
}

export const OperatorIntelligenceDecisionOutcomeContractRuntime = Object.freeze({
  contract: OPERATOR_INTELLIGENCE_DECISION_OUTCOME_CONTRACT,
  build: buildOperatorIntelligenceDecisionOutcomeContract,
});
