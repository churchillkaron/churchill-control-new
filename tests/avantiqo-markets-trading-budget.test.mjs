import assert from "node:assert/strict";
import test from "node:test";

import { summarizeRollingTradingBudget } from "../lib/markets/runtime/MarketTradingBudgetModels.js";

const fill = (notional, costBps) => ({
  notional,
  metadata: {
    execution_quality: {
      total_execution_cost_bps: costBps,
    },
  },
});

test("rolling trading budget summarizes turnover and execution-cost leakage", () => {
  const result = summarizeRollingTradingBudget({
    equity: 100000,
    fills: [fill(10000, 20), fill(15000, 30)],
    proposedSide: "BUY",
    proposedNotional: 5000,
    policy: {
      max_rolling_24h_turnover_pct: 100,
      max_rolling_24h_execution_cost_pct_equity: 1,
    },
  });

  assert.equal(result.approved, true);
  assert.ok(Math.abs(result.metrics.turnover_pct_equity - 25) < 1e-12);
  assert.ok(Math.abs(result.metrics.projected_turnover_pct_equity - 30) < 1e-12);
  assert.ok(result.metrics.realized_execution_cost_amount > 0);
});

test("projected BUY is blocked when rolling turnover cap would be exceeded", () => {
  const result = summarizeRollingTradingBudget({
    equity: 100000,
    fills: [fill(40000, 10), fill(30000, 10)],
    proposedSide: "BUY",
    proposedNotional: 20000,
    policy: {
      max_rolling_24h_turnover_pct: 80,
      max_rolling_24h_execution_cost_pct_equity: 1,
    },
  });

  assert.equal(result.approved, false);
  assert.match(result.reasons.join(" "), /turnover/i);
});

test("BUY is blocked after execution-cost budget is consumed", () => {
  const result = summarizeRollingTradingBudget({
    equity: 100000,
    fills: [fill(50000, 80)],
    proposedSide: "BUY",
    proposedNotional: 1000,
    policy: {
      max_rolling_24h_turnover_pct: 200,
      max_rolling_24h_execution_cost_pct_equity: 0.25,
    },
  });

  assert.equal(result.approved, false);
  assert.match(result.reasons.join(" "), /execution-cost/i);
});

test("SELL de-risking ignores exhausted rolling budget", () => {
  const result = summarizeRollingTradingBudget({
    equity: 100000,
    fills: [fill(150000, 100)],
    proposedSide: "SELL",
    proposedNotional: 25000,
    policy: {
      max_rolling_24h_turnover_pct: 50,
      max_rolling_24h_execution_cost_pct_equity: 0.1,
    },
  });

  assert.equal(result.approved, true);
});
