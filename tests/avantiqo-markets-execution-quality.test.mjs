import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateExecutionQuality,
  summarizeExecutionQuality,
} from "../lib/markets/runtime/MarketExecutionQualityModels.js";

test("BUY execution quality measures adverse price movement positively", () => {
  const result = calculateExecutionQuality({
    side: "BUY",
    orderQuantity: 100,
    fillQuantity: 25,
    arrivalPrice: 100,
    marketReferencePrice: 100.1,
    fillPrice: 100.2,
    bidPrice: 100,
    askPrice: 100.1,
    displayedShares: 200,
    feeAmount: 0.25,
  });

  assert.ok(result.implementation_shortfall_bps > 0);
  assert.ok(result.top_of_book_slippage_bps > 0);
  assert.equal(result.slice_fill_ratio, 0.25);
  assert.equal(result.displayed_liquidity_participation, 0.125);
});

test("SELL execution quality treats lower fill as adverse", () => {
  const result = calculateExecutionQuality({
    side: "SELL",
    orderQuantity: 50,
    fillQuantity: 10,
    arrivalPrice: 100,
    marketReferencePrice: 99.9,
    fillPrice: 99.8,
    bidPrice: 99.9,
    askPrice: 100,
    displayedShares: 100,
  });

  assert.ok(result.implementation_shortfall_bps > 0);
  assert.ok(result.top_of_book_slippage_bps > 0);
});

test("execution summary is notional weighted", () => {
  const summary = summarizeExecutionQuality([
    {
      notional: 1000,
      metadata: {
        execution_quality: {
          implementation_shortfall_bps: 10,
          top_of_book_slippage_bps: 5,
          spread_bps: 8,
          total_execution_cost_bps: 11,
          displayed_liquidity_participation: 0.1,
        },
      },
    },
    {
      notional: 3000,
      metadata: {
        execution_quality: {
          implementation_shortfall_bps: 2,
          top_of_book_slippage_bps: 1,
          spread_bps: 4,
          total_execution_cost_bps: 3,
          displayed_liquidity_participation: 0.2,
        },
      },
    },
  ]);

  assert.equal(summary.sample_count, 2);
  assert.equal(summary.fill_notional, 4000);
  assert.ok(Math.abs(summary.avg_implementation_shortfall_bps - 4) < 1e-12);
  assert.ok(Math.abs(summary.avg_total_execution_cost_bps - 5) < 1e-12);
});
