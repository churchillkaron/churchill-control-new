export const OPERATOR_INTELLIGENCE_DECISION_COMMITMENT_CONTRACT =
  "AVANTIQO_OPERATOR_INTELLIGENCE_DECISION_COMMITMENT_V1";

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeDecision(value = {}) {
  const source = object(value);
  const selected = object(source.selected_candidate);
  return {
    candidate_id: text(source.candidate_id || selected.id, 160) || null,
    mutates: source.mutates === true || selected.mutates === true,
    irreversible: source.irreversible === true || selected.irreversible === true,
    requires_human: source.requires_human === true || selected.requires_human === true,
    already_applied: source.already_applied === true || source.executed === true,
  };
}

function normalizeFallback(value = {}, currentCandidateId = null) {
  const source = object(value);
  const candidateId = text(source.candidate_id || source.id, 160) || null;
  const validated = source.validated === true;
  const decisionReady = source.decision_ready === true;
  return {
    candidate_id: candidateId,
    validated,
    decision_ready: decisionReady,
    mutates: source.mutates === true,
    irreversible: source.irreversible === true,
    requires_human: source.requires_human === true,
    distinct_from_current: Boolean(candidateId && candidateId !== currentCandidateId),
    usable_for_planning: Boolean(
      candidateId &&
      candidateId !== currentCandidateId &&
      validated &&
      decisionReady
    ),
  };
}

function normalizeProgress(value = {}) {
  const source = object(value);
  return {
    effort_spent: finiteNumber(source.effort_spent),
    cost_spent: finiteNumber(source.cost_spent),
    steps_completed: finiteNumber(source.steps_completed),
    total_steps: finiteNumber(source.total_steps),
  };
}

function readyForCurrentDecision(readiness = {}) {
  const source = object(readiness);
  return ["READY_FOR_RECOMMENDATION", "READY_FOR_HUMAN_GOVERNANCE"].includes(text(source.status, 80));
}

function validityState(validity = {}) {
  const source = object(validity);
  const status = text(source.status, 80);
  return {
    status,
    valid_now: source.decision_valid_now === true,
    verified_invalidated: status === "INVALIDATED_BY_VERIFIED_CHANGE",
    needs_revalidation: status === "REVALIDATION_REQUIRED" ||
      (status && status !== "INVALIDATED_BY_VERIFIED_CHANGE" && source.decision_valid_now === false),
  };
}

function contingencyState(contingency = {}) {
  const source = object(contingency);
  const status = text(source.status, 80);
  return {
    status,
    ready: status === "CONTINGENCY_READY" && source.contingency_ready === true,
    critical_gaps: status === "CRITICAL_CONTINGENCY_GAPS",
    gaps: [
      "CONTINGENCY_GAPS",
      "UNMAPPED_INVALIDATION_TRIGGERS",
      "FAILURE_MODES_REQUIRED",
    ].includes(status),
  };
}

function outcomeContractState(outcomeContract = {}) {
  const source = object(outcomeContract);
  return {
    status: text(source.status, 80),
    ready: source.status === "OUTCOME_CONTRACT_READY" && source.outcome_contract_ready === true,
  };
}

function outcomeState(outcome = {}) {
  const source = object(outcome);
  const status = text(source.status, 80);
  return {
    status,
    present: Boolean(status),
    failed: status === "OUTCOME_FAILED",
    warning: status === "OUTCOME_WARNING",
    inconclusive: status === "OUTCOME_INCONCLUSIVE",
    succeeded: status === "OUTCOME_SUCCEEDED" && source.decision_success_proven === true,
  };
}

function uncertaintyState(uncertainty = {}) {
  const source = object(uncertainty);
  const status = text(source.status, 80);
  return {
    status,
    human_required: status === "HUMAN_DECISION_REQUIRED",
    resolve_first: status === "RESOLVE_NEXT",
  };
}

function adverseDecisionTransition({ decision, fallback, reason }) {
  if (decision.already_applied && (decision.mutates || decision.irreversible)) {
    return {
      status: "ESCALATE_TO_HUMAN",
      next_action: "REVIEW_ALREADY_APPLIED_DECISION_WITH_CURRENT_VERIFIED_EVIDENCE_BEFORE_ANY_RECOVERY_OR_REPLACEMENT",
      reason,
      fallback_selected_for_planning: null,
    };
  }
  if (fallback.usable_for_planning) {
    return {
      status: "SWITCH_TO_FALLBACK",
      next_action: "REPLAN_AROUND_VALIDATED_FALLBACK_WITHOUT_EXECUTING_IT",
      reason,
      fallback_selected_for_planning: fallback.candidate_id,
    };
  }
  return {
    status: "ABANDON_CURRENT_DECISION",
    next_action: "STOP_RELYING_ON_CURRENT_DECISION_AND_REPLAN_WITHOUT_EXECUTING_RECOVERY",
    reason,
    fallback_selected_for_planning: null,
  };
}

export function assessOperatorIntelligenceDecisionCommitment({
  decision = {},
  readiness = {},
  validity = {},
  uncertainty_priority = {},
  contingency = {},
  outcome_contract = {},
  outcome_assessment = {},
  fallback_candidate = {},
  governance_state = {},
  progress = {},
  decision_critical = true,
} = {}) {
  const normalizedDecision = normalizeDecision(decision);
  const fallback = normalizeFallback(fallback_candidate, normalizedDecision.candidate_id);
  const progressContext = normalizeProgress(progress);
  const validityInfo = validityState(validity);
  const contingencyInfo = contingencyState(contingency);
  const outcomeContractInfo = outcomeContractState(outcome_contract);
  const outcomeInfo = outcomeState(outcome_assessment);
  const uncertaintyInfo = uncertaintyState(uncertainty_priority);
  const governance = object(governance_state);
  const decisionCritical = decision_critical !== false;

  let status = "DECISION_SELECTION_REQUIRED";
  let nextAction = "SELECT_A_CURRENT_DECISION_BEFORE_COMMITMENT_ASSESSMENT";
  let reason = "DECISION_NOT_SELECTED";
  let fallbackSelectedForPlanning = null;

  if (normalizedDecision.candidate_id) {
    if (governance.blocked === true || governance.safety_critical_issue === true || governance.requires_human_decision === true) {
      status = "ESCALATE_TO_HUMAN";
      nextAction = "REQUEST_CURRENT_HUMAN_GOVERNANCE_BEFORE_FURTHER_COMMITMENT";
      reason = governance.safety_critical_issue === true
        ? "SAFETY_CRITICAL_GOVERNANCE_BOUNDARY"
        : "CURRENT_GOVERNANCE_BOUNDARY";
    } else if (validityInfo.verified_invalidated) {
      const transition = adverseDecisionTransition({
        decision: normalizedDecision,
        fallback,
        reason: "VERIFIED_DECISION_INVALIDATION",
      });
      ({ status, next_action: nextAction, reason, fallback_selected_for_planning: fallbackSelectedForPlanning } = transition);
    } else if (outcomeInfo.failed) {
      const transition = adverseDecisionTransition({
        decision: normalizedDecision,
        fallback,
        reason: "VERIFIED_OUTCOME_FAILURE",
      });
      ({ status, next_action: nextAction, reason, fallback_selected_for_planning: fallbackSelectedForPlanning } = transition);
    } else if (uncertaintyInfo.human_required) {
      status = "ESCALATE_TO_HUMAN";
      nextAction = "RESOLVE_HIGHEST_VALUE_HUMAN_ONLY_UNCERTAINTY";
      reason = "HUMAN_ONLY_DECISION_UNCERTAINTY";
    } else if (validityInfo.needs_revalidation) {
      status = "PAUSE_AND_REVALIDATE";
      nextAction = "REVALIDATE_CURRENT_DECISION_BEFORE_FURTHER_COMMITMENT";
      reason = "CURRENT_VALIDITY_NOT_PROVEN";
    } else if (outcomeInfo.warning) {
      status = "PAUSE_AND_REVALIDATE";
      nextAction = "REVIEW_WARNING_AND_REVALIDATE_RELEVANT_DECISION_DEPENDENCIES";
      reason = "VERIFIED_OUTCOME_WARNING";
    } else if (uncertaintyInfo.resolve_first) {
      status = "RESOLVE_UNCERTAINTY_FIRST";
      nextAction = text(object(uncertainty_priority).next_action, 160) || "RESOLVE_HIGHEST_VALUE_UNCERTAINTY_BEFORE_COMMITMENT";
      reason = "DECISION_RELEVANT_UNCERTAINTY_REMAINS";
    } else if (contingencyInfo.critical_gaps || contingencyInfo.gaps) {
      status = "PAUSE_AND_REVALIDATE";
      nextAction = "CLOSE_CURRENT_CONTINGENCY_GAPS_BEFORE_FURTHER_COMMITMENT";
      reason = contingencyInfo.critical_gaps ? "CRITICAL_CONTINGENCY_GAPS" : "CONTINGENCY_GAPS";
    } else if (decisionCritical && !outcomeContractInfo.ready) {
      status = "PAUSE_AND_REVALIDATE";
      nextAction = "BUILD_A_READY_FALSIFIABLE_OUTCOME_CONTRACT_BEFORE_COMMITMENT";
      reason = "DECISION_CRITICAL_OUTCOME_CONTRACT_NOT_READY";
    } else if (!readyForCurrentDecision(readiness)) {
      const readinessStatus = text(object(readiness).status, 80);
      if (readinessStatus === "RESEARCH_FIRST") {
        status = "RESOLVE_UNCERTAINTY_FIRST";
        nextAction = text(object(readiness).next_action, 160) || "RESOLVE_REQUIRED_EVIDENCE_BEFORE_COMMITMENT";
        reason = "DECISION_READINESS_REQUIRES_RESEARCH";
      } else if (readinessStatus === "NO_FEASIBLE_DECISION") {
        status = "ABANDON_CURRENT_DECISION";
        nextAction = "STOP_RELYING_ON_CURRENT_DECISION_AND_GENERATE_NEW_FEASIBLE_ALTERNATIVES";
        reason = "NO_FEASIBLE_DECISION";
      } else {
        status = "PAUSE_AND_REVALIDATE";
        nextAction = "RESTORE_DECISION_READINESS_BEFORE_FURTHER_COMMITMENT";
        reason = readinessStatus || "DECISION_READINESS_NOT_PROVEN";
      }
    } else if (outcomeInfo.inconclusive) {
      status = "PAUSE_AND_REVALIDATE";
      nextAction = "COLLECT_OR_RECONCILE_REQUIRED_VERIFIED_OUTCOME_OBSERVATIONS";
      reason = "OUTCOME_INCONCLUSIVE";
    } else {
      status = "COMMIT_CURRENT_DECISION";
      nextAction = normalizedDecision.mutates || normalizedDecision.irreversible || normalizedDecision.requires_human
        ? "PRESERVE_CURRENT_DECISION_FOR_CURRENT_HUMAN_OPERATOR_GOVERNANCE_WITHOUT_EXECUTING_IT"
        : "CONTINUE_CURRENT_PLAN_WITHOUT_CLAIMING_OUTCOME_SUCCESS_OR_EXECUTION_AUTHORITY";
      reason = outcomeInfo.succeeded
        ? "VERIFIED_OUTCOME_SUPPORTS_CURRENT_DECISION"
        : "CURRENT_DECISION_REMAINS_VALID_READY_AND_GOVERNED";
    }
  }

  return {
    success: true,
    contract: OPERATOR_INTELLIGENCE_DECISION_COMMITMENT_CONTRACT,
    status,
    next_action: nextAction,
    reason,
    decision: normalizedDecision,
    decision_critical: decisionCritical,
    fallback_candidate: fallback,
    fallback_selected_for_planning: fallbackSelectedForPlanning,
    progress_context: progressContext,
    input_states: {
      readiness_status: text(object(readiness).status, 80) || null,
      validity_status: validityInfo.status || null,
      uncertainty_status: uncertaintyInfo.status || null,
      contingency_status: contingencyInfo.status || null,
      outcome_contract_status: outcomeContractInfo.status || null,
      outcome_assessment_status: outcomeInfo.status || null,
    },
    commitment_policy: {
      verified_invalidation_overrides_prior_commitment: true,
      verified_failure_overrides_prior_commitment: true,
      warning_requires_review_before_commitment_continues: true,
      decision_flipping_uncertainty_blocks_commitment: true,
      critical_contingency_gaps_block_commitment: true,
      decision_critical_requires_falsifiable_outcome_contract: true,
      fallback_must_be_explicit_validated_and_decision_ready: true,
      fallback_switch_is_planning_only: true,
      already_applied_mutating_or_irreversible_adverse_decision_requires_human_review: true,
      past_effort_never_overrides_current_invalidating_evidence: true,
      sunk_cost_never_increases_commitment: true,
      completed_work_never_rescues_an_invalid_decision: true,
      model_numeric_commitment_scores_are_never_trusted: true,
      prior_approval_never_substitutes_for_current_governance: true,
      commitment_is_not_execution_authority: true,
      abandonment_is_not_rollback_authority: true,
      fallback_selection_is_not_execution_authority: true,
    },
    governance: {
      planning_only: true,
      executes_tools: false,
      authorizes_business_actions: false,
      performs_rollback: false,
      switches_business_state: false,
      triggers_recovery: false,
      commitment_is_not_execution_authority: true,
      abandonment_is_cognitive_only: true,
      fallback_switch_is_cognitive_only: true,
      current_permissions_confirmation_wallet_and_verification_still_apply: true,
      mutation_authority_added: false,
      learning_state_mutated: false,
      raw_reasoning_persisted: false,
    },
  };
}

export const OperatorIntelligenceDecisionCommitmentRuntime = Object.freeze({
  contract: OPERATOR_INTELLIGENCE_DECISION_COMMITMENT_CONTRACT,
  assess: assessOperatorIntelligenceDecisionCommitment,
});
