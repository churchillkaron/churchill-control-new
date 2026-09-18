import assert from "node:assert/strict";
import test from "node:test";

import { simulateWalkForward } from "../lib/markets/runtime/MarketWalkForwardModels.js";

function trendingBars(count = 140) {
  return Array.from({ length: count }, (_, index) => {
    const open = 100 + (index * 0.6);
    const close = open + 0.45;
    const day = new Date(Date.UTC(2026, 0, 1 + index));
    return {
      symbol: "TEST",
      bar_time: day.toISOString(),
      open,
      high: close + 0.2,
      low: open - 0.2,
      close,
      volume: 100000 + index,
    };
  });
}

test("walk-forward simulation produces durable out-of-sample folds", () => {
  const result = simulateWalkForward({
    symbol: "TEST",
    bars: trendingBars(),
    trainingBars: 60,
    testBars: 20,
    transactionCostBps: 10,
    initialEquity: 100000,
  });

  assert.equal(result.status, "COMPLETED");
  assert.ok(result.folds.length >= 3);
  assert.equal(result.summary.strategy_key, "TECHNICAL_QUANT_V1");
  assert.ok(result.summary.trade_count >= 1);
  assert.ok(result.summary.final_equity > 0);
  assert.ok(result.summary.max_drawdown_pct >= 0);
  assert.ok(result.folds.every((fold) => fold.train_end < fold.test_start));
});

test("first test-day decision cannot see that day's close", () => {
  const baselineBars = trendingBars(100);
  const alteredBars = trendingBars(100);
  alteredBars[60] = {
    ...alteredBars[60],
    close: alteredBars[60].close * 0.25,
    low: alteredBars[60].low * 0.25,
  };

  const baseline = simulateWalkForward({
    symbol: "TEST",
    bars: baselineBars,
    trainingBars: 60,
    testBars: 10,
  });
  const altered = simulateWalkForward({
    symbol: "TEST",
    bars: alteredBars,
    trainingBars: 60,
    testBars: 10,
  });

  const firstBaseline = baseline.folds[0].decisions[0];
  const firstAltered = altered.folds[0].decisions[0];

  assert.equal(firstBaseline.signal_date, firstAltered.signal_date);
  assert.equal(firstBaseline.execution_date, firstAltered.execution_date);
  assert.equal(firstBaseline.action, firstAltered.action);
  assert.equal(firstBaseline.confidence, firstAltered.confidence);
  assert.notEqual(firstBaseline.ending_equity, firstAltered.ending_equity);
});

test("insufficient history fails closed", () => {
  const result = simulateWalkForward({
    symbol: "TEST",
    bars: trendingBars(20),
    trainingBars: 60,
    testBars: 10,
  });

  assert.equal(result.status, "INSUFFICIENT_DATA");
  assert.equal(result.folds.length, 0);
});
