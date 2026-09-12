import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import {
  aggregateCodeAIEngineeringPerformance,
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
  assert.match(history, /aggregateCodeAIEngineeringPerformance/);
  assert.match(history, /performance,/);
  assert.match(route, /performance: history\.performance/);
  assert.match(panel, /data-avantiqo-code-engineering-performance="true"/);
  assert.match(panel, /First pass/);
  assert.match(panel, /Reasoning avg/);
  assert.match(panel, /Efficiency/);
  assert.match(benchmark, /measured_from_attested_mission_history: true/);
  assert.match(benchmark, /AVANTIQO_CODE_COMPETITIVE_BENCHMARK_V1/);
  assert.match(benchmark, /external_superiority_claim_effect: "NONE"/);
});
