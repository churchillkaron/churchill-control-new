import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateProtectiveLevels,
  evaluateProtectiveExit,
  trailingStopLevel,
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

test("trailing stop ratchets from high-water only after profit", () => {
  const inactive = trailingStopLevel({
    averageEntryPrice: 100,
    highWaterPrice: 100,
    fixedStopPrice: 95,
    trailingStopPct: 7.5,
  });
  const active = trailingStopLevel({
    averageEntryPrice: 100,
    highWaterPrice: 120,
    fixedStopPrice: 95,
    trailingStopPct: 7.5,
  });

  assert.equal(inactive, null);
  assert.ok(Math.abs(active - 111) < 1e-12);
});

test("trailing stop triggers above the original fixed stop after a rally", () => {
  const result = evaluateProtectiveExit({
    position: {
      quantity: 10,
      average_entry_price: 100,
      stop_loss_price: 95,
      take_profit_price: 140,
      high_water_price: 120,
      opened_at: "2026-09-10T00:00:00Z",
    },
    snapshot: {
      bid_price: 110.5,
    },
    trailingStopEnabled: true,
    trailingStopPct: 7.5,
    timeExitEnabled: false,
    now: new Date("2026-09-18T00:00:00Z"),
  });

  assert.equal(result.triggered, true);
  assert.equal(result.reason, "TRAILING_STOP");
  assert.ok(Math.abs(result.trigger_price - 111) < 1e-12);
});

test("maximum holding period triggers deterministic exit", () => {
  const result = evaluateProtectiveExit({
    position: {
      quantity: 10,
      average_entry_price: 100,
      stop_loss_price: 90,
      take_profit_price: 150,
      high_water_price: 105,
      opened_at: "2026-08-01T00:00:00Z",
    },
    snapshot: {
      bid_price: 102,
    },
    trailingStopEnabled: false,
    timeExitEnabled: true,
    maxHoldingDays: 30,
    now: new Date("2026-09-18T00:00:00Z"),
  });

  assert.equal(result.triggered, true);
  assert.equal(result.reason, "MAX_HOLDING_PERIOD");
  assert.ok(result.holding_days >= 30);
});

test("disabled time exit does not close an old position", () => {
  const result = evaluateProtectiveExit({
    position: {
      quantity: 10,
      average_entry_price: 100,
      stop_loss_price: 90,
      take_profit_price: 150,
      high_water_price: 105,
      opened_at: "2026-08-01T00:00:00Z",
    },
    snapshot: {
      bid_price: 102,
    },
    trailingStopEnabled: false,
    timeExitEnabled: false,
    maxHoldingDays: 30,
    now: new Date("2026-09-18T00:00:00Z"),
  });

  assert.equal(result.triggered, false);
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
