import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateStrategyDrift,
  summarizeStrategyOutcomes,
} from "../lib/markets/runtime/MarketStrategyDriftModels.js";

function goodOutcomes(count = 20) {
  return Array.from({ length: count }, (_, index) => ({
    directional_hit: index % 4 !== 0,
    squared_error: 0.12,
    log_loss: 0.35,
    excess_return: 0.01,
  }));
}

test("strategy drift summary aggregates scored outcomes", () => {
  const summary = summarizeStrategyOutcomes(goodOutcomes(20));

  assert.equal(summary.sample_count, 20);
  assert.ok(summary.directional_hit_rate > 0.7);
  assert.ok(Math.abs(summary.avg_brier - 0.12) < 1e-12);
  assert.ok(Math.abs(summary.avg_log_loss - 0.35) < 1e-12);
});

test("sparse mature outcomes do not prematurely block BUY", () => {
  const result = evaluateStrategyDrift({
    action: "BUY",
    automationPolicy: {
      strategy_health_min_samples: 20,
    },
    outcomes: goodOutcomes(8),
  });

  assert.equal(result.ready, true);
  assert.equal(result.status, "INSUFFICIENT_MATURE_OUTCOMES");
});

test("healthy mature outcomes admit autonomous BUY", () => {
  const result = evaluateStrategyDrift({
    action: "BUY",
    automationPolicy: {
      strategy_health_min_samples: 20,
      strategy_health_max_brier: 0.3,
      strategy_health_max_log_loss: 0.9,
      strategy_health_min_directional_hit_rate: 0.45,
      strategy_health_min_avg_excess_return: -0.01,
    },
    outcomes: goodOutcomes(25),
  });

  assert.equal(result.ready, true);
  assert.equal(result.status, "STRATEGY_HEALTHY");
});

test("degraded calibration and hit rate block BUY", () => {
  const outcomes = Array.from({ length: 25 }, () => ({
    directional_hit: false,
    squared_error: 0.5,
    log_loss: 1.4,
    excess_return: -0.03,
  }));
  const result = evaluateStrategyDrift({
    action: "BUY",
    automationPolicy: {
      strategy_health_min_samples: 20,
      strategy_health_max_brier: 0.3,
      strategy_health_max_log_loss: 0.9,
      strategy_health_min_directional_hit_rate: 0.45,
      strategy_health_min_avg_excess_return: -0.01,
    },
    outcomes,
  });

  assert.equal(result.ready, false);
  assert.equal(result.status, "STRATEGY_DRIFT_DETECTED");
  assert.ok(result.reasons.length >= 3);
});

test("SELL de-risking remains available during drift", () => {
  const result = evaluateStrategyDrift({
    action: "SELL",
    outcomes: Array.from({ length: 30 }, () => ({
      directional_hit: false,
      squared_error: 0.8,
      log_loss: 2,
      excess_return: -0.05,
    })),
  });

  assert.equal(result.ready, true);
  assert.equal(result.status, "DE_RISKING_ALLOWED");
});
