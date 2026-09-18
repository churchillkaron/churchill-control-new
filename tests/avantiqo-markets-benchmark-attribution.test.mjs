import assert from "node:assert/strict";
import test from "node:test";

import {
  applyBenchmarkAttribution,
  benchmarkReturnForInterval,
  summarizeBenchmarkAttribution,
} from "../lib/markets/runtime/MarketBenchmarkModels.js";

const bars = [
  { bar_time: "2026-09-01T20:00:00Z", close: 100 },
  { bar_time: "2026-09-02T20:00:00Z", close: 102 },
  { bar_time: "2026-09-03T20:00:00Z", close: 101 },
  { bar_time: "2026-09-04T20:00:00Z", close: 104 },
  { bar_time: "2026-09-05T20:00:00Z", close: 105 },
];

test("benchmark interval uses last close before prediction and first close after evaluation", () => {
  const result = benchmarkReturnForInterval({
    bars,
    predictionTime: "2026-09-02T21:00:00Z",
    evaluationTime: "2026-09-04T12:00:00Z",
  });

  assert.equal(result.available, true);
  assert.equal(result.start_bar.close, 102);
  assert.equal(result.end_bar.close, 104);
  assert.ok(Math.abs(result.benchmark_return - ((104 - 102) / 102)) < 1e-12);
});

test("benchmark attribution calculates excess return", () => {
  const result = applyBenchmarkAttribution({
    realizedReturn: 0.08,
    benchmarkReturn: 0.03,
  });
  assert.ok(Math.abs(result.excess_return - 0.05) < 1e-12);
});

test("missing interval evidence fails closed", () => {
  const result = benchmarkReturnForInterval({
    bars,
    predictionTime: "2026-08-01T00:00:00Z",
    evaluationTime: "2026-08-02T00:00:00Z",
  });
  assert.equal(result.available, false);
  assert.equal(result.benchmark_return, null);
});

test("benchmark summary reports outperformance separately from raw return", () => {
  const result = summarizeBenchmarkAttribution([
    { realized_return: 0.10, benchmark_return: 0.05, excess_return: 0.05 },
    { realized_return: -0.01, benchmark_return: 0.02, excess_return: -0.03 },
    { realized_return: 0.04, benchmark_return: 0.01, excess_return: 0.03 },
  ]);

  assert.equal(result.sample_count, 3);
  assert.ok(Math.abs(result.avg_excess_return - (0.05 - 0.03 + 0.03) / 3) < 1e-12);
  assert.ok(Math.abs(result.benchmark_outperformance_rate - (2 / 3)) < 1e-12);
});
