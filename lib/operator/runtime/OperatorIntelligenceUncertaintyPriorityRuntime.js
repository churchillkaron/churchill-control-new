export const OPERATOR_INTELLIGENCE_UNCERTAINTY_PRIORITY_CONTRACT =
  "AVANTIQO_OPERATOR_INTELLIGENCE_UNCERTAINTY_PRIORITY_V1";

const MAX_UNCERTAINTIES = 20;
const IMPACT = Object.freeze({ none: 0, low: 1, medium: 2, high: 3, critical: 4 });
const INFORMATION = Object.freeze({ none: 0, low: 1, medium: 2, high: 3, decisive: 4 });
const RESOLVABILITY = Object.freeze({ impossible: 0, low: 1, medium: 2, high: 3, certain: 4 });
const COST = Object.freeze({ none: 0, low: 1, medium: 2, high: 3 });
const LATENCY = Object.freeze({ immediate: 0, short: 1, medium: 2, long: 3 });
const RESOLUTION_PATHS = new Set(["live_read", "research", "verification", "analysis", "human"]);

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function enumValue(value, allowed, fallback) {
  const clean = text(value, 80).toLowerCase();
  return Object.prototype.hasOwnProperty.call(allowed, clean) ? clean : fallback;
}

function resolutionPath(value) {
  const clean = text(value, 80).toLowerCase();
  return RESOLUTION_PATHS.has(clean) ? clean : "analysis";
}

function uniqueText(values, limit = 200) {
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

function normalizeUncertainty(value = {}, index = 0) {
  const source = object(value);
  const path = resolutionPath(source.resolution_path || source.path);
  const humanOnly = source.human_only === true || path === "human";
  return {
    id: text(source.id, 160) || `uncertainty-${index + 1}`,
    question: text(source.question || source.title || source.description, 700) || `Uncertainty ${index + 1}`,
    resolved: source.resolved === true,
    safety_critical: source.safety_critical === true,
    decision_flip_possible: source.decision_flip_possible === true || source.could_change_selection === true,
    blocks_completion: source.blocks_completion === true,
    blocks_governance: source.blocks_governance === true || source.blocks_action === true,
    decision_impact: enumValue(source.decision_impact || source.impact, IMPACT, "medium"),
    information_gain: enumValue(source.information_gain, INFORMATION, "medium"),
    resolvability: enumValue(source.resolvability, RESOLVABILITY, humanOnly ? "certain" : "medium"),
    cost: enumValue(source.cost, COST, "low"),
    latency: enumValue(source.latency, LATENCY, "short"),
    resolution_path: path,
    human_only: humanOnly,
    dependency_ids: uniqueText(source.dependency_ids, 160).slice(0, 12),
  };
}

function actionable(item) {
  if (item.resolved) return false;
  if (item.safety_critical || item.decision_flip_possible || item.blocks_completion || item.blocks_governance) return true;
  return IMPACT[item.decision_impact] >= IMPACT.medium && INFORMATION[item.information_gain] >= INFORMATION.medium;
}

function impossible(item) {
  return item.resolution_path !== "human" && RESOLVABILITY[item.resolvability] === RESOLVABILITY.impossible;
}

function comparePriority(left, right) {
  return (
    Number(right.safety_critical) - Number(left.safety_critical) ||
    Number(right.decision_flip_possible) - Number(left.decision_flip_possible) ||
    Number(right.blocks_governance) - Number(left.blocks_governance) ||
    Number(right.blocks_completion) - Number(left.blocks_completion) ||
    IMPACT[right.decision_impact] - IMPACT[left.decision_impact] ||
    INFORMATION[right.information_gain] - INFORMATION[left.information_gain] ||
    RESOLVABILITY[right.resolvability] - RESOLVABILITY[left.resolvability] ||
    COST[left.cost] - COST[right.cost] ||
    LATENCY[left.latency] - LATENCY[right.latency] ||
    left.id.localeCompare(right.id)
  );
}

function safeSummary(item) {
  return {
    id: item.id,
    question: item.question,
    resolved: item.resolved,
    safety_critical: item.safety_critical,
    decision_flip_possible: item.decision_flip_possible,
    blocks_completion: item.blocks_completion,
    blocks_governance: item.blocks_governance,
    decision_impact: item.decision_impact,
    information_gain: item.information_gain,
    resolvability: item.resolvability,
    cost: item.cost,
    latency: item.latency,
    resolution_path: item.resolution_path,
    human_only: item.human_only,
    dependency_ids: item.dependency_ids,
    actionable: actionable(item),
    resolution_blocked: impossible(item),
  };
}

export function prioritizeOperatorIntelligenceUncertainties({
  goal,
  uncertainties = [],
} = {}) {
  const cleanGoal = text(goal, 1200);
  if (!cleanGoal) throw new Error("OPERATOR_INTELLIGENCE_UNCERTAINTY_PRIORITY_GOAL_REQUIRED");

  const normalized = list(uncertainties)
    .slice(0, MAX_UNCERTAINTIES)
    .map(normalizeUncertainty);
  const unresolved = normalized.filter((item) => !item.resolved);
  const actionableRows = unresolved.filter(actionable).sort(comparePriority);
  const resolvableRows = actionableRows.filter((item) => !impossible(item));
  const blockedRows = actionableRows.filter(impossible);
  const selected = resolvableRows[0] || null;

  let status = "NO_UNRESOLVED_UNCERTAINTY";
  let nextAction = "CONTINUE_WITH_CURRENT_EVIDENCE";
  if (unresolved.length > 0 && actionableRows.length === 0) {
    status = "DEFER_LOW_VALUE_UNCERTAINTIES";
    nextAction = "DO_NOT_SPEND_MORE_EFFORT_UNLESS_DECISION_CONTEXT_CHANGES";
  } else if (!selected && blockedRows.length > 0) {
    status = "UNCERTAINTY_RESOLUTION_BLOCKED";
    nextAction = "REPORT_BLOCKER_OR_FIND_NEW_EVIDENCE_PATH";
  } else if (selected?.human_only) {
    status = "HUMAN_DECISION_REQUIRED";
    nextAction = "ASK_ONLY_THE_HIGHEST_VALUE_HUMAN_QUESTION";
  } else if (selected) {
    status = "RESOLVE_NEXT";
    nextAction = `RESOLVE_VIA_${selected.resolution_path.toUpperCase()}`;
  }

  return {
    success: true,
    contract: OPERATOR_INTELLIGENCE_UNCERTAINTY_PRIORITY_CONTRACT,
    goal: cleanGoal,
    status,
    next_action: nextAction,
    selected_uncertainty: selected ? safeSummary(selected) : null,
    uncertainty_count: normalized.length,
    unresolved_count: unresolved.length,
    actionable_count: actionableRows.length,
    blocked_actionable_count: blockedRows.length,
    ranked_uncertainties: actionableRows.map(safeSummary),
    deferred_uncertainties: unresolved.filter((item) => !actionable(item)).map(safeSummary),
    ranking_policy: {
      safety_critical_first: true,
      decision_flip_possible_second: true,
      governance_and_completion_blockers_prioritized: true,
      then_decision_impact: true,
      then_information_gain: true,
      then_resolvability: true,
      then_lower_cost_and_latency: true,
      model_numeric_priority_scores_trusted: false,
      resolved_uncertainties_never_selected: true,
      low_value_uncertainties_can_be_deferred: true,
    },
    governance: {
      planning_only: true,
      executes_tools: false,
      authorizes_business_actions: false,
      selected_resolution_path_is_not_execution_authority: true,
      human_question_is_not_prior_approval_reuse: true,
      mutation_authority_added: false,
      learning_state_mutated: false,
      raw_reasoning_persisted: false,
    },
  };
}

export const OperatorIntelligenceUncertaintyPriorityRuntime = Object.freeze({
  contract: OPERATOR_INTELLIGENCE_UNCERTAINTY_PRIORITY_CONTRACT,
  prioritize: prioritizeOperatorIntelligenceUncertainties,
});
