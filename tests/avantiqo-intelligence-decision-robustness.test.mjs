import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  OPERATOR_INTELLIGENCE_DECISION_ROBUSTNESS_CONTRACT,
  stressTestOperatorIntelligenceDecision,
} from "../lib/operator/runtime/OperatorIntelligenceDecisionRobustnessRuntime.js";

function evidence(id = "ev-main") { return { id, trusted: true, current: true }; }
function recommendationA(overrides = {}) { return { id: "option-a", title: "Option A", kind: "recommendation", risk: "low", reversible: true, cost: "low", latency: "short", goal_progress: "high", information_gain: "low", evidence_ids: ["ev-main"], ...overrides }; }
function recommendationB(overrides = {}) { return { id: "option-b", title: "Option B", kind: "recommendation", risk: "medium", reversible: true, cost: "medium", latency: "short", goal_progress: "medium", information_gain: "low", evidence_ids: ["ev-main"], ...overrides }; }

test("robustness runtime exposes canonical contract and never gains execution authority", () => {
  const result = stressTestOperatorIntelligenceDecision({ goal: "Choose a robust path", candidates: [recommendationA(), recommendationB()], evidence: [evidence()], scenarios: [
    { id: "slower", candidate_overrides: [{ candidate_id: "option-a", overrides: { latency: "medium" } }] },
    { id: "costlier", candidate_overrides: [{ candidate_id: "option-a", overrides: { cost: "medium" } }] },
  ] });
  assert.equal(result.contract, OPERATOR_INTELLIGENCE_DECISION_ROBUSTNESS_CONTRACT);
  assert.equal(result.status, "ROBUST_ACROSS_TESTED_SCENARIOS");
  assert.equal(result.baseline.candidate_id, "option-a");
  assert.equal(result.governance.executes_tools, false);
  assert.equal(result.governance.authorizes_business_actions, false);
  assert.equal(result.governance.learning_state_mutated, false);
});

test("verified material change that flips the decision marks the baseline brittle", () => {
  const result = stressTestOperatorIntelligenceDecision({ goal: "Choose a robust path", candidates: [recommendationA(), recommendationB()], evidence: [evidence()], scenarios: [
    { id: "verified-risk", kind: "verified", candidate_overrides: [{ candidate_id: "option-a", overrides: { risk: "critical", reversible: false, irreversible: true } }] },
    { id: "neutral", candidate_overrides: [{ candidate_id: "option-b", overrides: { cost: "high" } }] },
  ] });
  assert.equal(result.status, "BRITTLE_UNDER_VERIFIED_CHANGE");
  assert.equal(result.verified_instability_count, 1);
  assert.equal(result.scenario_results[0]?.selection.candidate_id, "option-b");
  assert.equal(result.robustness.verified_change_invalidates_robustness, true);
});

test("plausible assumption sensitivity requests more evidence instead of pretending robustness", () => {
  const result = stressTestOperatorIntelligenceDecision({ goal: "Choose under uncertain economics", candidates: [recommendationA(), recommendationB()], evidence: [evidence()], scenarios: [
    { id: "cost-reversal", kind: "plausible", candidate_overrides: [
      { candidate_id: "option-a", overrides: { risk: "medium", cost: "high" } },
      { candidate_id: "option-b", overrides: { risk: "low", cost: "low", goal_progress: "high" } },
    ] },
    { id: "latency-only", candidate_overrides: [{ candidate_id: "option-a", overrides: { latency: "medium" } }] },
  ] });
  assert.equal(result.status, "SENSITIVE_TO_PLAUSIBLE_CHANGE");
  assert.equal(result.recommendation, "GATHER_EVIDENCE_ON_DECISION_SENSITIVE_ASSUMPTIONS");
  assert.equal(result.robustness.selected_candidate_stable_across_material_scenarios, false);
});

test("hypothetical evidence removal never becomes live evidence", () => {
  const result = stressTestOperatorIntelligenceDecision({ goal: "Test evidence dependence", candidates: [recommendationA(), recommendationB()], evidence: [evidence()], scenarios: [
    { id: "remove-support", evidence_remove_ids: ["ev-main"] },
    { id: "add-uncertainty", uncertainty_additions: [{ id: "unknown", critical: true }] },
  ] });
  assert.equal(result.robustness.hypothetical_scenarios_are_not_live_evidence, true);
  assert.equal(result.governance.hypothetical_scenario_never_overrides_verified_evidence, true);
});

test("one material scenario is insufficient for a robustness claim", () => {
  const result = stressTestOperatorIntelligenceDecision({ goal: "Require more than one stress probe", candidates: [recommendationA(), recommendationB()], evidence: [evidence()], scenarios: [
    { id: "only-one", candidate_overrides: [{ candidate_id: "option-a", overrides: { cost: "medium" } }] },
  ] });
  assert.equal(result.status, "ROBUSTNESS_TESTS_INSUFFICIENT");
  assert.equal(result.robustness.enough_material_scenarios, false);
});

test("planning tool exposes stress testing without gaining execution authority", () => {
  const source = fs.readFileSync(new URL("../lib/operator/runtime/OperatorIntelligencePlanningToolRuntime.js", import.meta.url), "utf8");
  assert.match(source, /AVANTIQO_OPERATOR_INTELLIGENCE_PLANNING_TOOLS_V12/);
  assert.match(source, /"stress_test"/);
  assert.match(source, /decision_robustness_contract/);
  assert.match(source, /hypothetical_scenarios_never_become_live_evidence/);
  assert.match(source, /executes_business_actions: false/);
});
