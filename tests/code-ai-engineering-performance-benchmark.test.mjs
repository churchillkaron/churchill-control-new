import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import {
  aggregateCodeAIEngineeringPerformance,
  compareCodeAIEngineeringPerformanceWindows,
  deriveCodeAIEngineeringImprovementBacklog,
} from "../lib/code/runtime/CodeAIEngineeringPerformanceMetricsRuntime.js";

test("real mission performance metrics measure quality, first-pass rate, reasoning and intervention", () => {
  const metrics = aggregateCodeAIEngineeringPerformance([
    {
      verified_complete: true,
      performance: {
        first_pass_success: true,
        reasoning_calls_used: 1,
        employee_passes_used: 1,
        failure_count: 0,
        repair_count: 0,
        owner_intervention_count: 0,
        isolated_candidate_competition_used: false,
        candidate_assisted_verified_completion: false,
        final_review_repair_count: 0,
        employee_continuation_count: 0,
        runtime_evidence_required: true,
        runtime_evidence_verified: true,
        wall_ms: 1000,
      },
    },
    {
      verified_complete: true,
      performance: {
        first_pass_success: false,
        reasoning_calls_used: 3,
        employee_passes_used: 2,
        failure_count: 1,
        repair_count: 1,
        owner_intervention_count: 1,
        isolated_candidate_competition_used: true,
        candidate_assisted_verified_completion: true,
        final_review_repair_count: 1,
        employee_continuation_count: 1,
        runtime_evidence_required: true,
        runtime_evidence_verified: true,
        wall_ms: 4000,
      },
    },
    {
      verified_complete: false,
      performance: {
        first_pass_success: false,
        reasoning_calls_used: 4,
        employee_passes_used: 3,
        failure_count: 2,
        repair_count: 1,
        owner_intervention_count: 0,
        isolated_candidate_competition_used: false,
        candidate_assisted_verified_completion: false,
        final_review_repair_count: 0,
        employee_continuation_count: 1,
        runtime_evidence_required: false,
        runtime_evidence_verified: false,
        wall_ms: 8000,
      },
    },
  ]);

  assert.equal(metrics.mission_count, 3);
  assert.equal(metrics.verified_completion_rate, 0.6667);
  assert.equal(metrics.first_pass_success_rate, 0.3333);
  assert.equal(metrics.average_reasoning_calls, 2.67);
  assert.equal(metrics.average_employee_passes, 2);
  assert.equal(metrics.human_intervention_rate, 0.3333);
  assert.equal(metrics.isolated_candidate_mission_count, 1);
  assert.equal(metrics.isolated_candidate_mission_rate, 0.3333);
  assert.equal(metrics.candidate_assisted_verified_completion_count, 1);
  assert.equal(metrics.candidate_assisted_verified_completion_rate, 0.3333);
  assert.equal(metrics.average_final_review_repair_count, 0.33);
  assert.equal(metrics.average_employee_continuation_count, 0.67);
  assert.equal(metrics.runtime_evidence_verified_rate, 1);
  assert.equal(metrics.p50_wall_ms, 4000);
  assert.equal(metrics.p95_wall_ms, 8000);
  assert.ok(metrics.engineering_efficiency_score > 0);
  assert.ok(metrics.engineering_efficiency_score <= 100);
});

test("mission history, API and shared UI expose one longitudinal performance projection", async () => {
  const history = await readFile("lib/code/runtime/CodeAIMissionHistoryRuntime.js", "utf8");
  const route = await readFile("app/api/operator/code/history/route.js", "utf8");
  const panel = await readFile("components/operator/CodeMissionHistoryPanel.jsx", "utf8");
  const benchmark = await readFile("lib/code/runtime/CodeAIEngineeringPerformanceBenchmarkRuntime.js", "utf8");

  assert.match(history, /missionPerformanceProjection/);
  assert.match(history, /reasoningCalls <= 1/);
  assert.match(history, /candidate_assisted_verified_completion/);
  assert.match(history, /final_independent_review_controller/);
  assert.match(history, /state\.created_at \|\| row\.created_at/);
  assert.match(history, /aggregateCodeAIEngineeringPerformance/);
  assert.match(history, /performance,/);
  assert.match(route, /performance: history\.performance/);
  assert.match(panel, /data-avantiqo-code-engineering-performance="true"/);
  assert.match(panel, /Direct first pass/);
  assert.match(panel, /Reasoning avg/);
  assert.match(panel, /Efficiency/);
  assert.match(benchmark, /measured_from_attested_mission_history: true/);
  assert.match(benchmark, /AVANTIQO_CODE_COMPETITIVE_BENCHMARK_V1/);
  assert.match(benchmark, /external_superiority_claim_effect: "NONE"/);
});


test("performance trend and backlog turn repeated weakness into prioritized engineering work", () => {
  const weak = Array.from({ length: 10 }, (_, index) => ({
    verified_complete: index < 6,
    performance: {
      first_pass_success: index < 4,
      reasoning_calls_used: 4,
      employee_passes_used: 3,
      failure_count: 1,
      repair_count: 1,
      owner_intervention_count: index < 3 ? 1 : 0,
      runtime_evidence_required: true,
      runtime_evidence_verified: index < 8,
      wall_ms: 5000 + index,
    },
  }));
  const strongerPrevious = Array.from({ length: 10 }, () => ({
    verified_complete: true,
    performance: {
      first_pass_success: true,
      reasoning_calls_used: 2,
      employee_passes_used: 1,
      failure_count: 0,
      repair_count: 0,
      owner_intervention_count: 0,
      runtime_evidence_required: true,
      runtime_evidence_verified: true,
      wall_ms: 3000,
    },
  }));
  const sessions = [...weak, ...strongerPrevious];
  const trend = compareCodeAIEngineeringPerformanceWindows(sessions, 10);
  const metrics = aggregateCodeAIEngineeringPerformance(sessions.slice(0, 10));
  const backlog = deriveCodeAIEngineeringImprovementBacklog(metrics, trend);
  assert.equal(trend.sufficient_history, true);
  assert.ok(trend.delta.verified_completion_rate < 0);
  assert.ok(trend.delta.average_reasoning_calls > 0);
  assert.equal(backlog.items[0].priority, "P0");
  assert.ok(backlog.items.some((item) => item.area === "quality_regression"));
  assert.ok(backlog.items.some((item) => item.area === "reasoning_efficiency"));
});

test("Code-focused Product Engineering portfolio consumes measured performance only as advisory evidence", async () => {
  const portfolio = await readFile(
    "lib/platform/capabilities/createProductEngineeringPortfolioCapability.js",
    "utf8",
  );
  const panel = await readFile("components/operator/CodeMissionHistoryPanel.jsx", "utf8");
  const route = await readFile("app/api/operator/code/history/route.js", "utf8");
  assert.match(portfolio, /benchmarkCodeAIEngineeringPerformance/);
  assert.match(portfolio, /codeEngineeringImprovementGoal/);
  assert.match(portfolio, /ATTESTED CODE MISSION PERFORMANCE EVIDENCE/);
  assert.match(portfolio, /current-main repository evidence supports a concrete improvement/);
  assert.match(portfolio, /Metrics have no mutation, commit, deployment or governance authority/);
  assert.match(panel, /data-avantiqo-code-improvement-backlog="true"/);
  assert.match(panel, /Next measured improvement:/);
  assert.match(route, /performance_trend: history\.performance_trend/);
  assert.match(route, /improvement_backlog: history\.improvement_backlog/);
});
