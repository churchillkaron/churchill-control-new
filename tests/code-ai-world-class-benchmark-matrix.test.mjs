import assert from "node:assert/strict";
import test from "node:test";

import {
  prepareCodeAIWorldClassMission,
  competeCodeAISolutionStrategies,
  resolveCodeAIAdaptiveReasoningBudget,
} from "../lib/code/runtime/CodeAIWorldClassIntelligenceRuntime.js";

const scenarios = [
  {
    name: "simple bounded repair",
    objective: "Fix a local null handling defect without changing public behavior.",
    risk: "standard",
    failures: [],
    expectedMaxBudget: 4,
  },
  {
    name: "high-risk architecture repair",
    objective: "Repair architecture reliability and concurrency without breaking compatibility.",
    risk: "high",
    failures: [{ message: "race reproduced" }],
    expectedMinBudget: 5,
  },
  {
    name: "critical migration repair",
    objective: "Repair a critical schema migration path with security and reliability constraints.",
    risk: "critical",
    failures: [{ message: "migration failed" }, { message: "rollback failed" }, { message: "replay failed" }],
    expectedMinBudget: 7,
  },
];

for (const scenario of scenarios) {
  test(`benchmark: ${scenario.name}`, () => {
    const competition = competeCodeAISolutionStrategies({
      repository_impact: { risk: scenario.risk },
      specialist_review: {
        reviews: [
          {
            success: true,
            role: "architecture_performance",
            recommendation: "Use the existing canonical runtime and fix the root cause with targeted verification.",
            alternative: "Add a duplicate caller workaround.",
            confidence: 0.9,
            risks: [],
            verification: ["targeted test", "fresh diff"],
          },
        ],
      },
    });
    const budget = resolveCodeAIAdaptiveReasoningBudget({
      objective: scenario.objective,
      state: { failures: scenario.failures },
      repository_impact: { risk: scenario.risk },
      strategy_competition: competition,
    });
    assert.match(competition.selected.direction, /canonical|root cause/i);
    assert.equal(competition.additional_reasoning_calls, 0);
    assert.ok(budget.recommended_reasoning_calls <= 8);
    if (scenario.expectedMaxBudget) {
      assert.ok(budget.recommended_reasoning_calls <= scenario.expectedMaxBudget);
    }
    if (scenario.expectedMinBudget) {
      assert.ok(budget.recommended_reasoning_calls >= scenario.expectedMinBudget);
    }
  });
}

test("benchmark: Business Partner and Code Studio receive the same ten-layer controller", () => {
  const prepared = prepareCodeAIWorldClassMission({
    objective: "Repair a failed finance capability and resume the user's exact business action.",
    context: { metadata: { platform_self_healing: true, failed_capability_key: "finance.customer_invoice.create" } },
    resume_state: { repository_impact: { risk: "high" } },
  });
  const control = prepared.control;
  assert.equal(control.solution_strategy_competition.contract, "AVANTIQO_CODE_AI_SOLUTION_STRATEGY_COMPETITION_V1");
  assert.equal(control.causal_graph.contract, "AVANTIQO_CODE_AI_CAUSAL_GRAPH_V1");
  assert.equal(control.runtime_evidence_loop_enabled, true);
  assert.equal(control.isolated_candidate_competition.contract, "AVANTIQO_CODE_AI_ISOLATED_CANDIDATE_COMPETITION_V1");
  assert.equal(control.adaptive_reasoning_budget.contract, "AVANTIQO_CODE_AI_ADAPTIVE_REASONING_BUDGET_V1");
  assert.ok(Array.isArray(control.negative_engineering_memory));
  assert.equal(control.benchmark_scorecard.contract, "AVANTIQO_CODE_AI_ENGINEERING_SCOREBOARD_V1");
  assert.equal(control.cross_domain_business_recovery.contract, "AVANTIQO_CODE_AI_CROSS_DOMAIN_RECOVERY_V1");
  assert.ok(Array.isArray(control.proactive_improvement_opportunities));
  assert.equal(control.measured_intelligence_scoreboard_enabled, true);
  assert.equal(control.code_studio_business_partner_convergence, true);
});
