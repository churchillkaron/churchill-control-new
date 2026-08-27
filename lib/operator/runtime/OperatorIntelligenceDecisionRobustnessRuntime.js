import {
  deliberateOperatorIntelligenceDecision,
} from "./OperatorIntelligenceDeliberativeDecisionRuntime.js";

export const OPERATOR_INTELLIGENCE_DECISION_ROBUSTNESS_CONTRACT =
  "AVANTIQO_OPERATOR_INTELLIGENCE_DECISION_ROBUSTNESS_V1";

const MAX_SCENARIOS = 8;
const ALLOWED_SCENARIO_KINDS = new Set(["plausible", "adversarial", "verified"]);
const ALLOWED_OVERRIDE_FIELDS = new Set([
  "risk",
  "cost",
  "latency",
  "goal_progress",
  "information_gain",
  "evidence_ids",
  "supporting_evidence_ids",
  "unknown_dependencies",
  "constraint_violations",
  "violates_constraints",
  "requires_human",
  "reversible",
  "irreversible",
]);

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

function normalizeScenario(value = {}, index = 0) {
  const source = object(value);
  const kindCandidate = text(source.kind, 40).toLowerCase();
  const candidateOverrides = list(source.candidate_overrides).slice(0, 12).map((entry) => {
    const row = object(entry);
    const overrides = object(row.overrides);
    const safeOverrides = {};
    for (const [key, rawValue] of Object.entries(overrides)) {
      if (!ALLOWED_OVERRIDE_FIELDS.has(key)) continue;
      safeOverrides[key] = rawValue;
    }
    return {
      candidate_id: text(row.candidate_id || row.id, 160),
      overrides: safeOverrides,
    };
  }).filter((entry) => entry.candidate_id && Object.keys(entry.overrides).length);

  return {
    id: text(source.id, 160) || `scenario-${index + 1}`,
    title: text(source.title || source.description, 500) || `Scenario ${index + 1}`,
    kind: ALLOWED_SCENARIO_KINDS.has(kindCandidate) ? kindCandidate : "plausible",
    material: source.material !== false,
    candidate_overrides: candidateOverrides,
    uncertainty_additions: list(source.uncertainty_additions).slice(0, 8).map((item, uncertaintyIndex) => {
      const uncertainty = typeof item === "string" ? { question: item } : object(item);
      return {
        id: text(uncertainty.id || uncertainty.question, 160) || `${text(source.id, 120) || `scenario-${index + 1}`}-uncertainty-${uncertaintyIndex + 1}`,
        question: text(uncertainty.question || uncertainty.id, 500) || null,
        critical: uncertainty.critical !== false,
        resolved: uncertainty.resolved === true,
      };
    }),
    evidence_remove_ids: uniqueText(source.evidence_remove_ids, 160).slice(0, 16),
  };
}

function applyCandidateOverrides(candidates, scenario) {
  const overridesById = new Map(
    scenario.candidate_overrides.map((entry) => [entry.candidate_id, entry.overrides]),
  );
  return list(candidates).map((candidate) => {
    const source = object(candidate);
    const id = text(source.id, 160);
    const overrides = overridesById.get(id);
    return overrides ? { ...source, ...overrides } : { ...source };
  });
}

function applyEvidenceScenario(evidence, scenario) {
  const removed = new Set(scenario.evidence_remove_ids);
  return list(evidence).filter((item) => !removed.has(text(object(item).id || object(item).evidence_id, 160)));
}

function decisionSelection(decision = {}) {
  const source = object(decision);
  return {
    status: text(source.status, 80) || null,
    candidate_id: text(object(source.selected_candidate).id, 160) || null,
    rationale_code: text(source.rationale_code, 160) || null,
    alternatives_insufficient: source.alternatives_insufficient === true,
  };
}

function selectionReady(selection) {
  return Boolean(
    selection.candidate_id &&
    ["SELECTED_FOR_PLANNING", "RECOMMENDATION_REQUIRES_HUMAN"].includes(selection.status),
  );
}

export function stressTestOperatorIntelligenceDecision({
  goal,
  candidates = [],
  evidence = [],
  uncertainties = [],
  decision_critical = true,
  scenarios = [],
} = {}) {
  const cleanGoal = text(goal, 1200);
  if (!cleanGoal) throw new Error("OPERATOR_INTELLIGENCE_DECISION_ROBUSTNESS_GOAL_REQUIRED");

  const baselineDecision = deliberateOperatorIntelligenceDecision({
    goal: cleanGoal,
    candidates,
    evidence,
    uncertainties,
    decision_critical,
  });
  const baseline = decisionSelection(baselineDecision);
  const normalizedScenarios = list(scenarios).slice(0, MAX_SCENARIOS).map(normalizeScenario);

  const scenarioResults = normalizedScenarios.map((scenario) => {
    const scenarioDecision = deliberateOperatorIntelligenceDecision({
      goal: cleanGoal,
      candidates: applyCandidateOverrides(candidates, scenario),
      evidence: applyEvidenceScenario(evidence, scenario),
      uncertainties: [...list(uncertainties), ...scenario.uncertainty_additions],
      decision_critical,
    });
    const selection = decisionSelection(scenarioDecision);
    const changed = Boolean(
      selection.candidate_id !== baseline.candidate_id ||
      selection.status !== baseline.status ||
      selection.alternatives_insufficient !== baseline.alternatives_insufficient,
    );
    return {
      id: scenario.id,
      title: scenario.title,
      kind: scenario.kind,
      material: scenario.material,
      selection,
      changed_from_baseline: changed,
      baseline_candidate_preserved: Boolean(
        baseline.candidate_id && selection.candidate_id === baseline.candidate_id,
      ),
    };
  });

  const materialResults = scenarioResults.filter((row) => row.material);
  const unstable = materialResults.filter((row) => row.changed_from_baseline);
  const verifiedUnstable = unstable.filter((row) => row.kind === "verified");
  const adversarialUnstable = unstable.filter((row) => row.kind === "adversarial");

  let status = "ROBUSTNESS_TESTS_INSUFFICIENT";
  let recommendation = "ADD_MATERIAL_SCENARIOS_BEFORE_HIGH_CONFIDENCE_DECISION";
  if (!selectionReady(baseline)) {
    status = "BASELINE_NOT_DECISION_READY";
    recommendation = "RESOLVE_BASELINE_DELIBERATION_BEFORE_STRESS_TESTING";
  } else if (materialResults.length >= 2 && unstable.length === 0) {
    status = "ROBUST_ACROSS_TESTED_SCENARIOS";
    recommendation = "BASELINE_SELECTION_SURVIVES_TESTED_SCENARIOS";
  } else if (verifiedUnstable.length > 0) {
    status = "BRITTLE_UNDER_VERIFIED_CHANGE";
    recommendation = "REPLAN_FROM_VERIFIED_CHANGED_EVIDENCE";
  } else if (unstable.length > 0) {
    status = "SENSITIVE_TO_PLAUSIBLE_CHANGE";
    recommendation = adversarialUnstable.length === unstable.length
      ? "KEEP_SELECTION_GUARDED_AND_VERIFY_STRESS_ASSUMPTIONS"
      : "GATHER_EVIDENCE_ON_DECISION_SENSITIVE_ASSUMPTIONS";
  }

  return {
    success: true,
    contract: OPERATOR_INTELLIGENCE_DECISION_ROBUSTNESS_CONTRACT,
    goal: cleanGoal,
    status,
    recommendation,
    baseline,
    scenario_count: normalizedScenarios.length,
    material_scenario_count: materialResults.length,
    unstable_material_scenario_count: unstable.length,
    verified_instability_count: verifiedUnstable.length,
    scenario_results: scenarioResults,
    robustness: {
      baseline_decision_ready: selectionReady(baseline),
      enough_material_scenarios: materialResults.length >= 2,
      selected_candidate_stable_across_material_scenarios:
        materialResults.length >= 2 && unstable.length === 0,
      verified_change_invalidates_robustness: verifiedUnstable.length > 0,
      hypothetical_scenarios_are_not_live_evidence: true,
    },
    governance: {
      planning_only: true,
      executes_tools: false,
      authorizes_business_actions: false,
      recommendations_are_not_execution_authority: true,
      verified_scenario_change_requires_normal_replan_and_governance: true,
      hypothetical_scenario_never_overrides_verified_evidence: true,
      mutation_authority_added: false,
      learning_state_mutated: false,
      raw_reasoning_persisted: false,
    },
  };
}

export const OperatorIntelligenceDecisionRobustnessRuntime = Object.freeze({
  contract: OPERATOR_INTELLIGENCE_DECISION_ROBUSTNESS_CONTRACT,
  stressTest: stressTestOperatorIntelligenceDecision,
});
