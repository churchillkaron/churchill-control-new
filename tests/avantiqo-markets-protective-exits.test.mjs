import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateProtectiveLevels,
  evaluateProtectiveExit,
} from "../lib/markets/runtime/MarketProtectiveExitModels.js";

test("protective levels derive deterministic stop and take prices", () => {
  const result = calculateProtectiveLevels({
    averageEntryPrice: 100,
    stopLossPct: 5,
    takeProfitPct: 12,
  });

  assert.equal(result.enabled, true);
  assert.ok(Math.abs(result.stop_loss_price - 95) < 1e-12);
  assert.ok(Math.abs(result.take_profit_price - 112) < 1e-12);
});

test("stop-loss triggers from bid-side exit price", () => {
  const result = evaluateProtectiveExit({
    position: {
      quantity: 10,
      stop_loss_price: 95,
      take_profit_price: 110,
    },
    snapshot: {
      bid_price: 94.9,
      ask_price: 95.1,
    },
  });

  assert.equal(result.triggered, true);
  assert.equal(result.reason, "STOP_LOSS");
  assert.equal(result.exit_price, 94.9);
});

test("take-profit triggers from bid-side exit price", () => {
  const result = evaluateProtectiveExit({
    position: {
      quantity: 10,
      stop_loss_price: 95,
      take_profit_price: 110,
    },
    snapshot: {
      bid_price: 110.1,
      ask_price: 110.2,
    },
  });

  assert.equal(result.triggered, true);
  assert.equal(result.reason, "TAKE_PROFIT");
});

test("protective exit stays idle inside the band", () => {
  const result = evaluateProtectiveExit({
    position: {
      quantity: 10,
      stop_loss_price: 95,
      take_profit_price: 110,
    },
    snapshot: {
      bid_price: 102,
    },
  });

  assert.equal(result.triggered, false);
});

test("disabled protection never creates an exit", () => {
  const result = evaluateProtectiveExit({
    position: {
      quantity: 10,
      stop_loss_price: 95,
      take_profit_price: 110,
    },
    snapshot: {
      bid_price: 90,
    },
    enabled: false,
  });

  assert.equal(result.triggered, false);
});
