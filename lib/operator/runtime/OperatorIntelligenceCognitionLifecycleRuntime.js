const CONTRACT = "AVANTIQO_OPERATOR_INTELLIGENCE_COGNITION_LIFECYCLE_V1";

const STAGES = Object.freeze([
  "GOAL_CONSTRAINTS",
  "EVIDENCE",
  "DELIBERATION",
  "ROBUSTNESS",
  "VALIDITY",
  "UNCERTAINTY",
  "READINESS",
  "PROVENANCE",
  "CONTINGENCY",
  "OUTCOME_CONTRACT",
  "OUTCOME_ASSESSMENT",
  "COMMITMENT",
]);

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function text(value, limit = 200) {
  return String(value ?? "").trim().slice(0, limit);
}

function stageResult(stage, raw, decisionCritical) {
  const value = object(raw);
  const status = text(value.status, 120).toUpperCase();
  if (!Object.keys(value).length) return { stage, state: "MISSING", status: null, satisfied: false };

  let satisfied = false;
  switch (stage) {
    case "GOAL_CONSTRAINTS":
      satisfied = status === "CONSISTENCY_PROVEN" && value.consistency_proven === true;
      break;
    case "EVIDENCE":
      satisfied = value.evidence_ready === true || value.completion_proven === true || ["EVIDENCE_READY", "EVIDENCE_SUFFICIENT", "COMPLETION_PROVEN"].includes(status);
      break;
    case "DELIBERATION":
      satisfied = ["SELECTED_FOR_PLANNING", "RECOMMENDATION_REQUIRES_HUMAN"].includes(status) && !!object(value.selected_candidate).id;
      break;
    case "ROBUSTNESS":
      satisfied = status === "ROBUST_ACROSS_TESTED_SCENARIOS";
      break;
    case "VALIDITY":
      satisfied = status === "VALID_WITHIN_POLICY" && value.decision_valid_now === true;
      break;
    case "UNCERTAINTY":
      satisfied = ["NO_UNRESOLVED_UNCERTAINTY", "DEFER_LOW_VALUE_UNCERTAINTIES"].includes(status);
      break;
    case "READINESS":
      satisfied = ["READY_FOR_RECOMMENDATION", "READY_FOR_HUMAN_GOVERNANCE"].includes(status) && value.decision_ready === true;
      break;
    case "PROVENANCE":
      satisfied = status === "PROVENANCE_COMPLETE" || (!decisionCritical && status === "SINGLE_POINT_EVIDENCE_DEPENDENCY");
      break;
    case "CONTINGENCY":
      satisfied = status === "CONTINGENCY_READY" && value.contingency_ready === true;
      break;
    case "OUTCOME_CONTRACT":
      satisfied = status === "OUTCOME_CONTRACT_READY" && value.outcome_contract_ready === true;
      break;
    case "OUTCOME_ASSESSMENT":
      satisfied = ["OUTCOME_SUCCEEDED", "OUTCOME_FAILED", "OUTCOME_WARNING"].includes(status);
      break;
    case "COMMITMENT":
      satisfied = [
        "COMMIT_CURRENT_DECISION",
        "PAUSE_AND_REVALIDATE",
        "RESOLVE_UNCERTAINTY_FIRST",
        "SWITCH_TO_FALLBACK",
        "ABANDON_CURRENT_DECISION",
        "ESCALATE_TO_HUMAN",
      ].includes(status);
      break;
    default:
      satisfied = false;
  }

  return {
    stage,
    state: satisfied ? "SATISFIED" : "UNRESOLVED",
    status: status || null,
    satisfied,
  };
}

function nextActionFor(stage) {
  const actions = {
    GOAL_CONSTRAINTS: "ASSESS_GOAL_CONSTRAINTS",
    EVIDENCE: "ESTABLISH_CURRENT_VERIFIED_EVIDENCE",
    DELIBERATION: "DELIBERATE_ALTERNATIVES",
    ROBUSTNESS: "STRESS_TEST_SELECTED_DECISION",
    VALIDITY: "VALIDATE_DECISION_CURRENTNESS",
    UNCERTAINTY: "RESOLVE_OR_DEFER_UNCERTAINTY",
    READINESS: "ASSESS_DECISION_READINESS",
    PROVENANCE: "BUILD_DECISION_PROVENANCE",
    CONTINGENCY: "ASSESS_DECISION_CONTINGENCY",
    OUTCOME_CONTRACT: "BUILD_FALSIFIABLE_OUTCOME_CONTRACT",
    OUTCOME_ASSESSMENT: "WAIT_FOR_AND_ASSESS_VERIFIED_OUTCOME",
    COMMITMENT: "ASSESS_COMMITMENT_OR_RECONSIDERATION",
  };
  return actions[stage] || "NO_FURTHER_COGNITION_STAGE_REQUIRED";
}

export function assessOperatorIntelligenceCognitionLifecycle({
  goal_constraint_result = {},
  evidence_state = {},
  deliberation_result = {},
  robustness_result = {},
  validity_result = {},
  uncertainty_priority_result = {},
  readiness_result = {},
  provenance_result = {},
  contingency_result = {},
  outcome_contract_result = {},
  outcome_assessment_result = {},
  commitment_result = {},
  decision_critical = true,
} = {}) {
  const inputs = {
    GOAL_CONSTRAINTS: goal_constraint_result,
    EVIDENCE: evidence_state,
    DELIBERATION: deliberation_result,
    ROBUSTNESS: robustness_result,
    VALIDITY: validity_result,
    UNCERTAINTY: uncertainty_priority_result,
    READINESS: readiness_result,
    PROVENANCE: provenance_result,
    CONTINGENCY: contingency_result,
    OUTCOME_CONTRACT: outcome_contract_result,
    OUTCOME_ASSESSMENT: outcome_assessment_result,
    COMMITMENT: commitment_result,
  };

  const stages = STAGES.map((stage) => stageResult(stage, inputs[stage], decision_critical !== false));
  const firstUnresolvedIndex = stages.findIndex((row) => !row.satisfied);
  const complete = firstUnresolvedIndex === -1;
  const nextStage = complete ? null : stages[firstUnresolvedIndex].stage;
  const skippedLaterStages = complete
    ? []
    : stages.slice(firstUnresolvedIndex + 1).filter((row) => row.state !== "MISSING").map((row) => row.stage);

  return {
    contract: CONTRACT,
    status: complete ? "COGNITION_LIFECYCLE_COMPLETE" : skippedLaterStages.length ? "COGNITION_STAGE_ORDER_VIOLATION" : "COGNITION_STAGE_REQUIRED",
    lifecycle_complete: complete,
    next_required_stage: nextStage,
    next_action: nextActionFor(nextStage),
    stages,
    skipped_later_stage_ids: skippedLaterStages,
    lifecycle_policy: {
      earlier_unresolved_stage_blocks_later_stage_acceptance: true,
      later_stage_presence_never_proves_earlier_stage_completion: true,
      goal_constraints_precede_local_optimization: true,
      verified_evidence_precedes_decision_reliance: true,
      robustness_validity_and_uncertainty_precede_readiness: true,
      provenance_and_contingency_precede_outcome_contract: true,
      verified_outcome_precedes_final_commitment_reconsideration: true,
      stage_results_are_reused_not_recomputed: true,
      freeform_model_claims_never_advance_lifecycle: true,
    },
    governance: {
      planning_and_verification_only: true,
      executes_tools: false,
      authorizes_business_actions: false,
      mutates_business_state: false,
      schedules_monitoring: false,
      triggers_recovery: false,
      performs_rollback: false,
      promotes_learning_state: false,
      lifecycle_completion_is_not_execution_authority: true,
      current_permissions_confirmation_approval_wallet_and_verification_still_apply: true,
    },
  };
}

export const OPERATOR_INTELLIGENCE_COGNITION_LIFECYCLE_CONTRACT = CONTRACT;

export const OperatorIntelligenceCognitionLifecycleRuntime = Object.freeze({
  contract: CONTRACT,
  stages: STAGES,
  assess: assessOperatorIntelligenceCognitionLifecycle,
});
