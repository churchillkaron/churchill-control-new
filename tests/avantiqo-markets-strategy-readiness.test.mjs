import assert from "node:assert/strict";
import test from "node:test";

import { evaluateStrategyReadiness } from "../lib/markets/runtime/MarketStrategyReadinessModels.js";

const policy = {
  require_walk_forward_validation: true,
  validation_max_age_hours: 168,
  validation_min_trades: 5,
  validation_min_directional_hit_rate: 0.5,
  validation_max_drawdown_pct: 25,
  validation_min_total_return: 0,
};

test("BUY fails closed without completed walk-forward evidence", () => {
  const result = evaluateStrategyReadiness({
    action: "BUY",
    automationPolicy: policy,
    backtest: null,
    now: new Date("2026-09-18T12:00:00Z"),
  });
  assert.equal(result.ready, false);
  assert.equal(result.status, "NOT_READY");
  assert.ok(result.reasons.some((reason) => reason.includes("completed walk-forward")));
});

test("SELL remains allowed for de-risking without validation", () => {
  const result = evaluateStrategyReadiness({
    action: "SELL",
    automationPolicy: policy,
    backtest: null,
  });
  assert.equal(result.ready, true);
  assert.equal(result.status, "DE_RISKING_ALLOWED");
  assert.equal(result.metrics.live_authority_effect, "NONE");
});

test("fresh strong walk-forward evidence admits autonomous PAPER BUY", () => {
  const result = evaluateStrategyReadiness({
    action: "BUY",
    automationPolicy: policy,
    now: new Date("2026-09-18T12:00:00Z"),
    backtest: {
      status: "COMPLETED",
      completed_at: "2026-09-18T06:00:00Z",
      trade_count: 12,
      directional_hit_rate: 0.58,
      max_drawdown_pct: 11,
      total_return: 0.09,
    },
  });
  assert.equal(result.ready, true);
  assert.equal(result.status, "READY_FOR_AUTONOMOUS_PAPER");
  assert.equal(result.metrics.live_authority_effect, "NONE");
});

test("stale or weak validation blocks autonomous PAPER BUY", () => {
  const result = evaluateStrategyReadiness({
    action: "BUY",
    automationPolicy: policy,
    now: new Date("2026-09-18T12:00:00Z"),
    backtest: {
      status: "COMPLETED",
      completed_at: "2026-09-01T06:00:00Z",
      trade_count: 2,
      directional_hit_rate: 0.41,
      max_drawdown_pct: 31,
      total_return: -0.03,
    },
  });
  assert.equal(result.ready, false);
  assert.ok(result.reasons.length >= 4);
});

test("validation can be disabled for PAPER only without changing live authority", () => {
  const result = evaluateStrategyReadiness({
    action: "BUY",
    automationPolicy: {
      ...policy,
      require_walk_forward_validation: false,
    },
    backtest: null,
  });
  assert.equal(result.ready, true);
  assert.equal(result.status, "VALIDATION_NOT_REQUIRED");
  assert.equal(result.metrics.live_authority_effect, "NONE");
});
