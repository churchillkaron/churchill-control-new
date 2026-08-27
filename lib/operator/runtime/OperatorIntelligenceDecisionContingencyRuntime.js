export const OPERATOR_INTELLIGENCE_DECISION_CONTINGENCY_CONTRACT =
  "AVANTIQO_OPERATOR_INTELLIGENCE_DECISION_CONTINGENCY_V1";

const MAX_FAILURE_MODES = 16;
const SEVERITY = Object.freeze({ low: 0, medium: 1, high: 2, critical: 3 });
const LIKELIHOOD = Object.freeze({ rare: 0, possible: 1, likely: 2 });
const RECOVERY_TYPES = new Set(["rollback", "fallback", "replan", "stop", "human"]);

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

function enumValue(value, allowed, fallback) {
  const clean = text(value, 80).toLowerCase();
  return Object.prototype.hasOwnProperty.call(allowed, clean) ? clean : fallback;
}

function normalizeDecision(value = {}) {
  const source = object(value);
  const selected = object(source.selected_candidate);
  return {
    candidate_id: text(source.candidate_id || selected.id, 160) || null,
    mutates: source.mutates === true || selected.mutates === true,
    reversible: source.reversible === true || selected.reversible === true,
    irreversible: source.irreversible === true || selected.irreversible === true,
    requires_human: source.requires_human === true || selected.requires_human === true,
  };
}

function normalizeRecovery(value = {}) {
  const source = object(value);
  const typeCandidate = text(source.type || source.strategy, 80).toLowerCase();
  const type = RECOVERY_TYPES.has(typeCandidate) ? typeCandidate : null;
  return {
    type,
    steps: uniqueText(source.steps || source.actions, 500).slice(0, 10),
    verification_criteria: uniqueText(
      source.verification_criteria || source.completion_criteria,
      500,
    ).slice(0, 10),
    rollback_available: source.rollback_available === true,
    fallback_candidate_id: text(source.fallback_candidate_id, 160) || null,
    requires_human: source.requires_human === true || type === "human",
  };
}

function normalizeFailureMode(value = {}, index = 0) {
  const source = object(value);
  const detection = object(source.detection);
  const prevention = object(source.prevention);
  const recovery = normalizeRecovery(source.recovery);
  const severity = enumValue(source.severity, SEVERITY, "medium");
  return {
    id: text(source.id, 160) || `failure-mode-${index + 1}`,
    title: text(source.title || source.description, 700) || `Failure mode ${index + 1}`,
    severity,
    likelihood: enumValue(source.likelihood, LIKELIHOOD, "possible"),
    decision_invalidating: source.decision_invalidating === true,
    trigger_ids: uniqueText(source.trigger_ids || source.invalidation_trigger_ids, 160).slice(0, 16),
    detection: {
      signals: uniqueText(detection.signals || detection.indicators, 400).slice(0, 10),
      criteria: uniqueText(detection.criteria || detection.verification_criteria, 400).slice(0, 10),
      requires_live_read: detection.requires_live_read === true,
    },
    prevention: {
      controls: uniqueText(prevention.controls || prevention.safeguards, 400).slice(0, 10),
    },
    recovery,
    material: source.material !== false && SEVERITY[severity] >= SEVERITY.medium,
  };
}

function provenanceTriggers(provenance = {}) {
  return list(object(provenance).invalidation_triggers).slice(0, 24).map((item, index) => {
    const source = object(item);
    return {
      id: text(source.id, 160) || `trigger-${index + 1}`,
      type: text(source.type, 120) || null,
      reasons: uniqueText(source.reasons, 200).slice(0, 12),
    };
  });
}

function modeIssues(mode, decision) {
  const issues = [];
  const detectionPresent = mode.detection.signals.length > 0 || mode.detection.criteria.length > 0;
  const recoveryPresent = Boolean(mode.recovery.type);
  const recoveryVerified = mode.recovery.verification_criteria.length > 0;

  if (mode.material && !detectionPresent) issues.push("MATERIAL_FAILURE_DETECTION_REQUIRED");
  if (mode.material && !recoveryPresent) issues.push("MATERIAL_FAILURE_RECOVERY_REQUIRED");
  if (mode.material && recoveryPresent && !recoveryVerified) {
    issues.push("RECOVERY_VERIFICATION_CRITERIA_REQUIRED");
  }
  if (mode.recovery.type === "rollback" && !mode.recovery.rollback_available) {
    issues.push("ROLLBACK_DECLARED_BUT_NOT_AVAILABLE");
  }
  if (mode.recovery.type === "fallback" && !mode.recovery.fallback_candidate_id) {
    issues.push("FALLBACK_CANDIDATE_REQUIRED");
  }
  if ((decision.mutates || decision.irreversible) && recoveryPresent && !mode.recovery.requires_human) {
    issues.push("MUTATING_OR_IRREVERSIBLE_RECOVERY_REQUIRES_HUMAN_GOVERNANCE");
  }
  if (decision.irreversible && mode.recovery.type === "rollback") {
    issues.push("IRREVERSIBLE_DECISION_CANNOT_CLAIM_ROLLBACK_RECOVERY");
  }
  return issues;
}

function compareFailureModes(left, right) {
  return (
    SEVERITY[right.severity] - SEVERITY[left.severity] ||
    Number(right.decision_invalidating) - Number(left.decision_invalidating) ||
    Number(right.issues.length > 0) - Number(left.issues.length > 0) ||
    LIKELIHOOD[right.likelihood] - LIKELIHOOD[left.likelihood] ||
    left.id.localeCompare(right.id)
  );
}

export function assessOperatorIntelligenceDecisionContingency({
  decision = {},
  provenance = {},
  failure_modes = [],
  decision_critical = true,
} = {}) {
  const normalizedDecision = normalizeDecision(decision);
  const triggers = provenanceTriggers(provenance);
  const normalizedModes = list(failure_modes)
    .slice(0, MAX_FAILURE_MODES)
    .map(normalizeFailureMode)
    .map((mode) => ({ ...mode, issues: modeIssues(mode, normalizedDecision) }))
    .sort(compareFailureModes);

  const mappedTriggerIds = new Set(normalizedModes.flatMap((mode) => mode.trigger_ids));
  const unmappedTriggers = triggers.filter((trigger) => !mappedTriggerIds.has(trigger.id));
  const materialModes = normalizedModes.filter((mode) => mode.material || mode.decision_invalidating);
  const blockingModes = materialModes.filter((mode) => mode.issues.length > 0);
  const criticalBlockingModes = blockingModes.filter(
    (mode) => SEVERITY[mode.severity] >= SEVERITY.high,
  );

  let status = "DECISION_SELECTION_REQUIRED";
  let nextAction = "DELIBERATE_BEFORE_CONTINGENCY_ASSESSMENT";
  let contingencyReady = false;

  if (normalizedDecision.candidate_id) {
    if (decision_critical !== false && materialModes.length === 0 && triggers.length === 0) {
      status = "FAILURE_MODES_REQUIRED";
      nextAction = "DECLARE_KNOWN_MATERIAL_FAILURE_MODES_BEFORE_HIGH_CONFIDENCE_COMMITMENT";
    } else if (unmappedTriggers.length > 0) {
      status = "UNMAPPED_INVALIDATION_TRIGGERS";
      nextAction = "MAP_EACH_KNOWN_INVALIDATION_TRIGGER_TO_DETECTION_AND_RECOVERY";
    } else if (criticalBlockingModes.length > 0) {
      status = "CRITICAL_CONTINGENCY_GAPS";
      nextAction = "CLOSE_HIGH_OR_CRITICAL_DETECTION_RECOVERY_AND_VERIFICATION_GAPS";
    } else if (blockingModes.length > 0) {
      status = "CONTINGENCY_GAPS";
      nextAction = "CLOSE_MATERIAL_DETECTION_RECOVERY_AND_VERIFICATION_GAPS";
    } else if (materialModes.length > 0 || decision_critical === false) {
      status = "CONTINGENCY_READY";
      nextAction = normalizedDecision.mutates || normalizedDecision.irreversible
        ? "PRESERVE_CONTINGENCY_FOR_NORMAL_HUMAN_OPERATOR_GOVERNANCE"
        : "PRESERVE_DETECTION_RECOVERY_AND_VERIFICATION_BOUNDARIES_WITH_DECISION";
      contingencyReady = true;
    }
  }

  return {
    success: true,
    contract: OPERATOR_INTELLIGENCE_DECISION_CONTINGENCY_CONTRACT,
    status,
    contingency_ready: contingencyReady,
    next_action: nextAction,
    decision: normalizedDecision,
    decision_critical: decision_critical !== false,
    failure_mode_count: normalizedModes.length,
    material_failure_mode_count: materialModes.length,
    blocking_failure_mode_count: blockingModes.length,
    critical_blocking_failure_mode_count: criticalBlockingModes.length,
    failure_modes: normalizedModes,
    known_invalidation_triggers: triggers,
    unmapped_invalidation_triggers: unmappedTriggers,
    contingency_policy: {
      only_structured_declared_failure_modes_are_assessed: true,
      model_freeform_failure_stories_are_not_trusted: true,
      model_numeric_probability_scores_are_not_trusted: true,
      material_failure_modes_require_detection: true,
      material_failure_modes_require_recovery: true,
      recovery_requires_verification_criteria: true,
      provenance_invalidation_triggers_must_be_mapped: true,
      irreversible_decisions_cannot_claim_rollback: true,
      mutating_or_irreversible_recovery_requires_human_governance: true,
      contingency_readiness_is_not_execution_authority: true,
    },
    governance: {
      planning_only: true,
      executes_tools: false,
      authorizes_business_actions: false,
      contingency_is_not_execution_authority: true,
      contingency_is_not_completion_proof: true,
      recovery_steps_are_planning_descriptions_only: true,
      current_permissions_confirmation_wallet_and_verification_still_apply: true,
      prior_approval_never_substitutes_for_current_governance: true,
      mutation_authority_added: false,
      learning_state_mutated: false,
      raw_reasoning_persisted: false,
    },
  };
}

export const OperatorIntelligenceDecisionContingencyRuntime = Object.freeze({
  contract: OPERATOR_INTELLIGENCE_DECISION_CONTINGENCY_CONTRACT,
  assess: assessOperatorIntelligenceDecisionContingency,
});
