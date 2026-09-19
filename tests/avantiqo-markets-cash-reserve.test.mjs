import assert from "node:assert/strict";
import test from "node:test";

import { evaluateCashReserve } from "../lib/markets/runtime/MarketCashReserveModels.js";

test("BUY inside cash reserve remains approved", () => {
  const result = evaluateCashReserve({
    action: "BUY",
    cashBalance: 50000,
    equity: 100000,
    proposedNotional: 20000,
    policy: {
      min_cash_reserve_pct: 10,
      cash_reserve_execution_buffer_bps: 25,
    },
  });

  assert.equal(result.approved, true);
  assert.ok(result.metrics.projected_cash_pct_equity > 10);
});

test("BUY that consumes configured cash reserve is blocked", () => {
  const result = evaluateCashReserve({
    action: "BUY",
    cashBalance: 20000,
    equity: 100000,
    proposedNotional: 12000,
    policy: {
      min_cash_reserve_pct: 10,
      cash_reserve_execution_buffer_bps: 25,
    },
  });

  assert.equal(result.approved, false);
  assert.match(result.reasons.join(" "), /cash/i);
});

test("execution buffer can independently protect the cash floor", () => {
  const result = evaluateCashReserve({
    action: "BUY",
    cashBalance: 11000,
    equity: 100000,
    proposedNotional: 1000,
    policy: {
      min_cash_reserve_pct: 10,
      cash_reserve_execution_buffer_bps: 100,
    },
  });

  assert.equal(result.approved, false);
  assert.ok(result.metrics.buffered_buy_cost > 1000);
});

test("SELL de-risking remains available below reserve", () => {
  const result = evaluateCashReserve({
    action: "SELL",
    cashBalance: 1000,
    equity: 100000,
    proposedNotional: 25000,
    policy: {
      min_cash_reserve_pct: 20,
      cash_reserve_execution_buffer_bps: 25,
    },
  });

  assert.equal(result.approved, true);
});
