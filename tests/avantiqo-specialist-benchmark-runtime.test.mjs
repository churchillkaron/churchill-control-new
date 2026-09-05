import assert from "node:assert/strict";
import test from "node:test";

import {
  AVANTIQO_SPECIALIST_BENCHMARK_CONTRACT,
  compareAvantiqoSpecialistBenchmarkResults,
  evaluateAvantiqoSpecialistBenchmarkResult,
  listAvantiqoSpecialistBenchmarkCases,
} from "../lib/intelligence/runtime/AvantiqoSpecialistBenchmarkRuntime.js";

test("specialist benchmark has balanced Business, Avantiqo and Code coverage", () => {
  const cases = listAvantiqoSpecialistBenchmarkCases();
  assert.equal(cases.length, 6);
  const counts = Object.fromEntries(
    ["business", "avantiqo", "code"].map((domain) => [
      domain,
      cases.filter((item) => item.domain === domain).length,
    ]),
  );
  assert.deepEqual(counts, { business: 2, avantiqo: 2, code: 2 });
  assert.equal(cases.filter((item) => item.expected_depth === "fast").length, 1);
  assert.equal(cases.filter((item) => item.expected_depth === "deep").length, 5);
});

test("quality cannot compensate for a wrong route or missing required verification", () => {
  const result = evaluateAvantiqoSpecialistBenchmarkResult({
    case_id: "avantiqo-safe-lease-01",
    route_mode: "fast",
    verification_observed: false,
    current_evidence_observed: false,
    scores: {
      correctness: 1,
      evidence_grounding: 1,
      decision_quality: 1,
      verification_quality: 1,
    },
    ttft_ms: 50,
    total_latency_ms: 100,
  });

  assert.equal(result.contract, AVANTIQO_SPECIALIST_BENCHMARK_CONTRACT);
  assert.equal(result.quality_average, 1);
  assert.equal(result.route_correct, false);
  assert.equal(result.verification_satisfied, false);
  assert.equal(result.current_evidence_satisfied, false);
  assert.equal(result.passed, false);
});

test("a strong fully verified specialist result passes", () => {
  const result = evaluateAvantiqoSpecialistBenchmarkResult({
    case_id: "code-regression-debug-01",
    route_mode: "deep",
    verification_observed: true,
    current_evidence_observed: false,
    scores: {
      correctness: 0.95,
      evidence_grounding: 0.9,
      decision_quality: 0.88,
      verification_quality: 0.96,
    },
    ttft_ms: 120,
    total_latency_ms: 900,
  });

  assert.equal(result.hard_gate_passed, true);
  assert.equal(result.passed, true);
  assert.ok(result.quality_average >= 0.8);
  assert.equal(result.result_fingerprint.length, 64);
});

test("fast trivial code case is allowed to win on speed without sacrificing quality", () => {
  const result = evaluateAvantiqoSpecialistBenchmarkResult({
    case_id: "code-trivial-edit-02",
    route_mode: "fast",
    verification_observed: true,
    scores: {
      correctness: 1,
      evidence_grounding: 0.9,
      decision_quality: 0.9,
      verification_quality: 0.95,
    },
    ttft_ms: 20,
    total_latency_ms: 80,
  });

  assert.equal(result.expected_depth, "fast");
  assert.equal(result.route_correct, true);
  assert.equal(result.passed, true);
});

test("comparison reports quality and latency independently", () => {
  const base = {
    case_id: "business-pricing-unit-economics-02",
    route_mode: "deep",
    verification_observed: false,
    current_evidence_observed: false,
  };
  const comparison = compareAvantiqoSpecialistBenchmarkResults(
    {
      ...base,
      scores: {
        correctness: 0.95,
        evidence_grounding: 0.9,
        decision_quality: 0.92,
        verification_quality: 0.88,
      },
      ttft_ms: 80,
      total_latency_ms: 600,
    },
    {
      ...base,
      scores: {
        correctness: 0.85,
        evidence_grounding: 0.84,
        decision_quality: 0.86,
        verification_quality: 0.82,
      },
      ttft_ms: 60,
      total_latency_ms: 450,
    },
  );

  assert.equal(comparison.quality_winner, "left");
  assert.equal(comparison.latency_winner, "right");
  assert.ok(comparison.quality_delta > 0);
  assert.ok(comparison.latency_delta_ms > 0);
});

test("invalid latency evidence is rejected", () => {
  assert.throws(
    () => evaluateAvantiqoSpecialistBenchmarkResult({
      case_id: "business-cash-inventory-01",
      route_mode: "deep",
      verification_observed: false,
      current_evidence_observed: false,
      scores: {
        correctness: 0.9,
        evidence_grounding: 0.9,
        decision_quality: 0.9,
        verification_quality: 0.9,
      },
      ttft_ms: 500,
      total_latency_ms: 100,
    }),
    /AVANTIQO_SPECIALIST_BENCHMARK_LATENCY_INVALID/,
  );
});
