import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  OPERATOR_INTELLIGENCE_UNCERTAINTY_PRIORITY_CONTRACT,
  prioritizeOperatorIntelligenceUncertainties,
} from "../lib/operator/runtime/OperatorIntelligenceUncertaintyPriorityRuntime.js";

function uncertainty(overrides = {}) {
  return {
    id: "u-base",
    question: "Resolve this uncertainty",
    decision_impact: "medium",
    information_gain: "medium",
    resolvability: "medium",
    cost: "low",
    latency: "short",
    resolution_path: "research",
    ...overrides,
  };
}

test("uncertainty priority exposes canonical contract without execution authority", () => {
  const result = prioritizeOperatorIntelligenceUncertainties({
    goal: "Resolve the most useful unknown",
    uncertainties: [uncertainty()],
  });
  assert.equal(result.contract, OPERATOR_INTELLIGENCE_UNCERTAINTY_PRIORITY_CONTRACT);
  assert.equal(result.status, "RESOLVE_NEXT");
  assert.equal(result.selected_uncertainty?.id, "u-base");
  assert.equal(result.governance.executes_tools, false);
  assert.equal(result.governance.authorizes_business_actions, false);
});

test("safety-critical unknown outranks cheaper low-risk curiosity", () => {
  const result = prioritizeOperatorIntelligenceUncertainties({
    goal: "Prioritize safely",
    uncertainties: [
      uncertainty({ id: "cheap-curiosity", decision_impact: "high", information_gain: "high", cost: "none", latency: "immediate" }),
      uncertainty({ id: "safety", safety_critical: true, decision_impact: "critical", information_gain: "medium", cost: "medium", latency: "medium" }),
    ],
  });
  assert.equal(result.selected_uncertainty?.id, "safety");
});

test("decision-flipping uncertainty outranks ordinary blocker when safety is equal", () => {
  const result = prioritizeOperatorIntelligenceUncertainties({
    goal: "Resolve what could change the decision",
    uncertainties: [
      uncertainty({ id: "blocker", blocks_completion: true, decision_impact: "high", information_gain: "high" }),
      uncertainty({ id: "flip", decision_flip_possible: true, decision_impact: "high", information_gain: "medium" }),
    ],
  });
  assert.equal(result.selected_uncertainty?.id, "flip");
});

test("human-only uncertainty requests only the highest-value human question", () => {
  const result = prioritizeOperatorIntelligenceUncertainties({
    goal: "Ask the minimum necessary human question",
    uncertainties: [
      uncertainty({ id: "human", human_only: true, resolution_path: "human", decision_flip_possible: true, decision_impact: "critical" }),
      uncertainty({ id: "research", decision_impact: "medium", information_gain: "medium" }),
    ],
  });
  assert.equal(result.status, "HUMAN_DECISION_REQUIRED");
  assert.equal(result.selected_uncertainty?.id, "human");
  assert.equal(result.next_action, "ASK_ONLY_THE_HIGHEST_VALUE_HUMAN_QUESTION");
});

test("resolved and low-value unknowns are not selected", () => {
  const result = prioritizeOperatorIntelligenceUncertainties({
    goal: "Avoid useless research",
    uncertainties: [
      uncertainty({ id: "resolved", resolved: true, decision_impact: "critical", information_gain: "decisive" }),
      uncertainty({ id: "low-value", decision_impact: "low", information_gain: "low", cost: "high", latency: "long" }),
    ],
  });
  assert.equal(result.status, "DEFER_LOW_VALUE_UNCERTAINTIES");
  assert.equal(result.selected_uncertainty, null);
  assert.equal(result.deferred_uncertainties[0]?.id, "low-value");
});

test("model numeric priority scores are ignored", () => {
  const result = prioritizeOperatorIntelligenceUncertainties({
    goal: "Do not trust model utility numbers",
    uncertainties: [
      uncertainty({ id: "fake-high", priority_score: 999999, decision_impact: "medium", information_gain: "medium" }),
      uncertainty({ id: "real-high", priority_score: 0, decision_flip_possible: true, decision_impact: "high", information_gain: "high" }),
    ],
  });
  assert.equal(result.selected_uncertainty?.id, "real-high");
  assert.equal(result.ranking_policy.model_numeric_priority_scores_trusted, false);
});

test("planning tool exposes uncertainty prioritization without execution authority", () => {
  const source = fs.readFileSync(
    new URL("../lib/operator/runtime/OperatorIntelligencePlanningToolRuntime.js", import.meta.url),
    "utf8",
  );
  assert.match(source, /AVANTIQO_OPERATOR_INTELLIGENCE_PLANNING_TOOLS_V6/);
  assert.match(source, /"prioritize_uncertainty"/);
  assert.match(source, /uncertainty_priority_contract/);
  assert.match(source, /model_numeric_uncertainty_priority_scores_never_trusted/);
  assert.match(source, /executes_business_actions: false/);
});
