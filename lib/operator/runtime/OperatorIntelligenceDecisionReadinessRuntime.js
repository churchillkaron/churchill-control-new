export const OPERATOR_INTELLIGENCE_DECISION_READINESS_CONTRACT =
  "AVANTIQO_OPERATOR_INTELLIGENCE_DECISION_READINESS_V1";

const READY_DELIBERATION_STATUSES = new Set([
  "SELECTED_FOR_PLANNING",
  "RECOMMENDATION_REQUIRES_HUMAN",
]);
const ACCEPTABLE_UNCERTAINTY_STATUSES = new Set([
  "NO_UNRESOLVED_UNCERTAINTY",
  "DEFER_LOW_VALUE_UNCERTAINTIES",
]);
const CONFIDENCE_BANDS = Object.freeze({ low: 0, guarded: 1, moderate: 2, high: 3 });

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalizedStatus(value) {
  return text(value, 120).toUpperCase();
}

function confidenceBand(calibration = {}) {
  const source = object(calibration);
  const clean = text(source.confidence_band, 40).toLowerCase();
  return Object.prototype.hasOwnProperty.call(CONFIDENCE_BANDS, clean) ? clean : null;
}

function confidenceCalibrationProven(calibration = {}) {
  const source = object(calibration);
  return Boolean(
    confidenceBand(source) &&
    source.model_numeric_confidence_never_overrides_epistemic_ceiling === true &&
    source.confidence_never_increased === true,
  );
}

function gate(name, passed, code, detail = null) {
  return {
    name,
    passed: passed === true,
    code,
    detail: detail ? text(detail, 500) : null,
  };
}

function selectedCandidate(deliberation = {}) {
  return object(object(deliberation).selected_candidate);
}

export function assessOperatorIntelligenceDecisionReadiness({
  deliberation = {},
  robustness = {},
  validity = {},
  uncertainty_priority = {},
  confidence_calibration = {},
  decision_critical = true,
} = {}) {
  const deliberationSource = object(deliberation);
  const robustnessSource = object(robustness);
  const validitySource = object(validity);
  const uncertaintySource = object(uncertainty_priority);
  const confidenceSource = object(confidence_calibration);
  const candidate = selectedCandidate(deliberationSource);

  const deliberationStatus = normalizedStatus(deliberationSource.status);
  const robustnessStatus = normalizedStatus(robustnessSource.status);
  const validityStatus = normalizedStatus(validitySource.status);
  const uncertaintyStatus = normalizedStatus(uncertaintySource.status);
  const critical = decision_critical !== false;
  const band = confidenceBand(confidenceSource);
  const minimumBand = critical ? "moderate" : "guarded";
  const confidencePass = confidenceCalibrationProven(confidenceSource) &&
    CONFIDENCE_BANDS[band] >= CONFIDENCE_BANDS[minimumBand];

  const gates = [
    gate(
      "deliberation",
      READY_DELIBERATION_STATUSES.has(deliberationStatus) && Boolean(text(candidate.id, 160)),
      "DELIBERATION_SELECTION_REQUIRED",
      deliberationStatus || "missing",
    ),
    gate(
      "robustness",
      !critical || robustnessStatus === "ROBUST_ACROSS_TESTED_SCENARIOS",
      critical ? "DECISION_CRITICAL_ROBUSTNESS_REQUIRED" : "ROBUSTNESS_OPTIONAL_FOR_NONCRITICAL_DECISION",
      robustnessStatus || "missing",
    ),
    gate(
      "validity",
      validityStatus === "VALID_WITHIN_POLICY" && validitySource.decision_valid_now === true,
      "CURRENT_DECISION_VALIDITY_REQUIRED",
      validityStatus || "missing",
    ),
    gate(
      "uncertainty",
      ACCEPTABLE_UNCERTAINTY_STATUSES.has(uncertaintyStatus),
      "HIGHER_VALUE_UNCERTAINTY_MUST_BE_RESOLVED_OR_DEFERRED",
      uncertaintyStatus || "missing",
    ),
    gate(
      "confidence",
      confidencePass,
      "DETERMINISTIC_CONFIDENCE_CALIBRATION_REQUIRED",
      band ? `${band} (minimum ${minimumBand})` : "missing",
    ),
  ];

  let status = "DECISION_NOT_READY";
  let nextAction = "COMPLETE_MISSING_DECISION_GATES";
  let decisionReady = false;

  if (deliberationStatus === "EVIDENCE_FIRST") {
    status = "RESEARCH_FIRST";
    nextAction = "RESOLVE_SELECTED_INFORMATION_NEED_BEFORE_COMMITMENT";
  } else if (deliberationStatus === "ALTERNATIVES_INSUFFICIENT") {
    status = "ALTERNATIVES_REQUIRED";
    nextAction = "GENERATE_OR_VERIFY_MULTIPLE_FEASIBLE_ALTERNATIVES";
  } else if (deliberationStatus === "NO_FEASIBLE_CANDIDATE") {
    status = "NO_FEASIBLE_DECISION";
    nextAction = "REPLAN_OR_FIND_A_SAFE_FEASIBLE_ALTERNATIVE";
  } else if (validityStatus === "INVALIDATED_BY_VERIFIED_CHANGE") {
    status = "REPLAN_REQUIRED";
    nextAction = "REPLAN_FROM_VERIFIED_CHANGED_CONDITION";
  } else if (validityStatus === "REVALIDATION_REQUIRED") {
    status = "REVALIDATION_REQUIRED";
    nextAction = "REFRESH_STALE_OR_UNVERIFIED_DECISION_DEPENDENCIES";
  } else if (uncertaintyStatus === "RESOLVE_NEXT") {
    status = "RESEARCH_FIRST";
    nextAction = text(uncertaintySource.next_action, 160) || "RESOLVE_HIGHEST_VALUE_UNCERTAINTY";
  } else if (uncertaintyStatus === "HUMAN_DECISION_REQUIRED") {
    status = "HUMAN_INPUT_REQUIRED";
    nextAction = "ASK_ONLY_THE_HIGHEST_VALUE_HUMAN_QUESTION";
  } else if (uncertaintyStatus === "UNCERTAINTY_RESOLUTION_BLOCKED") {
    status = "UNCERTAINTY_BLOCKED";
    nextAction = "REPORT_BLOCKER_OR_FIND_NEW_EVIDENCE_PATH";
  } else if (critical && robustnessStatus === "BRITTLE_UNDER_VERIFIED_CHANGE") {
    status = "REPLAN_REQUIRED";
    nextAction = "REPLAN_FROM_VERIFIED_ROBUSTNESS_FAILURE";
  } else if (critical && robustnessStatus === "SENSITIVE_TO_PLAUSIBLE_CHANGE") {
    status = "RESEARCH_FIRST";
    nextAction = "RESOLVE_DECISION_SENSITIVE_ASSUMPTIONS";
  } else if (critical && robustnessStatus === "ROBUSTNESS_TESTS_INSUFFICIENT") {
    status = "ROBUSTNESS_REQUIRED";
    nextAction = "ADD_MATERIAL_STRESS_SCENARIOS";
  } else if (!confidenceCalibrationProven(confidenceSource)) {
    status = "CONFIDENCE_CALIBRATION_REQUIRED";
    nextAction = "CALIBRATE_CONFIDENCE_FROM_PROVEN_EPISTEMIC_STATE";
  } else if (!confidencePass) {
    status = "CONFIDENCE_TOO_LOW";
    nextAction = "IMPROVE_EVIDENCE_OR_REDUCE_UNRESOLVED_UNCERTAINTY";
  } else if (gates.every((row) => row.passed)) {
    decisionReady = true;
    const humanRequired = candidate.requires_human === true || candidate.mutates === true ||
      deliberationStatus === "RECOMMENDATION_REQUIRES_HUMAN";
    status = humanRequired ? "READY_FOR_HUMAN_GOVERNANCE" : "READY_FOR_RECOMMENDATION";
    nextAction = humanRequired
      ? "PASS_THROUGH_NORMAL_OPERATOR_GOVERNANCE_AND_CURRENT_HUMAN_REVIEW"
      : "PRESENT_RECOMMENDATION_WITH_EVIDENCE_AND_VALIDITY_BOUNDARIES";
  }

  return {
    success: true,
    contract: OPERATOR_INTELLIGENCE_DECISION_READINESS_CONTRACT,
    status,
    decision_ready: decisionReady,
    next_action: nextAction,
    selected_candidate_id: text(candidate.id, 160) || null,
    selected_candidate_mutates: candidate.mutates === true,
    selected_candidate_requires_human: candidate.requires_human === true,
    decision_critical: critical,
    minimum_confidence_band: minimumBand,
    calibrated_confidence_band: band,
    gates,
    readiness_policy: {
      decision_critical_requires_multiple_feasible_alternatives: true,
      decision_critical_requires_robustness: true,
      current_validity_required: true,
      higher_value_uncertainty_must_be_resolved_or_safely_deferred: true,
      calibrated_confidence_required: true,
      raw_model_confidence_never_establishes_readiness: true,
      mutating_selection_can_only_be_ready_for_governance: true,
    },
    governance: {
      planning_only: true,
      executes_tools: false,
      authorizes_business_actions: false,
      readiness_is_not_execution_authority: true,
      ready_for_human_governance_is_not_human_approval: true,
      prior_approval_never_substitutes_for_current_governance: true,
      current_permissions_confirmation_wallet_and_verification_still_apply: true,
      mutation_authority_added: false,
      learning_state_mutated: false,
      raw_reasoning_persisted: false,
    },
  };
}

export const OperatorIntelligenceDecisionReadinessRuntime = Object.freeze({
  contract: OPERATOR_INTELLIGENCE_DECISION_READINESS_CONTRACT,
  assess: assessOperatorIntelligenceDecisionReadiness,
});
