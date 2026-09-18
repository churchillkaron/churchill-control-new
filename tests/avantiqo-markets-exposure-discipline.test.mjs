import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateLossStreakCooloff,
  evaluateOpenPositionLimit,
  evaluateSymbolLossReentryLockout,
  summarizeClosedSellOrders,
} from "../lib/markets/runtime/MarketExposureDisciplineModels.js";

const fill = ({ order, pnl, time }) => ({
  order_id: order,
  side: "SELL",
  filled_at: time,
  metadata: { realized_pnl_delta: pnl },
});

test("open-position cap blocks only a new BUY position", () => {
  const positions = [
    { symbol: "AAA", quantity: 10 },
    { symbol: "BBB", quantity: 10 },
  ];
  const newPosition = evaluateOpenPositionLimit({
    action: "BUY",
    positions,
    proposedSymbol: "CCC",
    policy: { max_open_positions: 2 },
  });
  const addExisting = evaluateOpenPositionLimit({
    action: "BUY",
    positions,
    proposedSymbol: "AAA",
    policy: { max_open_positions: 2 },
  });

  assert.equal(newPosition.approved, false);
  assert.equal(addExisting.approved, true);
});

test("SELL de-risking ignores open-position cap", () => {
  const result = evaluateOpenPositionLimit({
    action: "SELL",
    positions: [
      { symbol: "AAA", quantity: 10 },
      { symbol: "BBB", quantity: 10 },
      { symbol: "CCC", quantity: 10 },
    ],
    proposedSymbol: "AAA",
    policy: { max_open_positions: 1 },
  });

  assert.equal(result.approved, true);
});

test("partial SELL fills aggregate into one closed-order outcome", () => {
  const closes = summarizeClosedSellOrders([
    fill({ order: "o1", pnl: -10, time: "2026-09-18T07:00:00Z" }),
    fill({ order: "o1", pnl: 3, time: "2026-09-18T07:02:00Z" }),
    fill({ order: "o2", pnl: 5, time: "2026-09-17T07:00:00Z" }),
  ]);

  assert.equal(closes.length, 2);
  assert.equal(closes[0].order_id, "o1");
  assert.equal(closes[0].realized_pnl_delta, -7);
  assert.equal(closes[0].outcome, "LOSS");
});

test("configured consecutive losses activate BUY cool-off", () => {
  const result = evaluateLossStreakCooloff({
    action: "BUY",
    fills: [
      fill({ order: "o3", pnl: -5, time: "2026-09-18T08:00:00Z" }),
      fill({ order: "o2", pnl: -10, time: "2026-09-18T06:00:00Z" }),
      fill({ order: "o1", pnl: -8, time: "2026-09-18T04:00:00Z" }),
    ],
    policy: {
      max_consecutive_losing_closes: 3,
      loss_streak_cooloff_hours: 24,
    },
    now: new Date("2026-09-18T10:00:00Z"),
  });

  assert.equal(result.approved, false);
  assert.equal(result.metrics.consecutive_losing_closes, 3);
  assert.equal(result.metrics.cooloff_active, true);
});

test("a profitable close resets the loss streak", () => {
  const result = evaluateLossStreakCooloff({
    action: "BUY",
    fills: [
      fill({ order: "o4", pnl: 12, time: "2026-09-18T09:00:00Z" }),
      fill({ order: "o3", pnl: -5, time: "2026-09-18T08:00:00Z" }),
      fill({ order: "o2", pnl: -10, time: "2026-09-18T06:00:00Z" }),
      fill({ order: "o1", pnl: -8, time: "2026-09-18T04:00:00Z" }),
    ],
    policy: {
      max_consecutive_losing_closes: 3,
      loss_streak_cooloff_hours: 24,
    },
    now: new Date("2026-09-18T10:00:00Z"),
  });

  assert.equal(result.approved, true);
  assert.equal(result.metrics.consecutive_losing_closes, 0);
});

test("recent realized loss locks only the same symbol from BUY re-entry", () => {
  const fills = [
    { ...fill({ order: "o2", pnl: -10, time: "2026-09-18T08:00:00Z" }), symbol: "AAA" },
    { ...fill({ order: "o1", pnl: 5, time: "2026-09-18T06:00:00Z" }), symbol: "BBB" },
  ];

  const sameSymbol = evaluateSymbolLossReentryLockout({
    action: "BUY",
    proposedSymbol: "AAA",
    fills,
    policy: { loss_reentry_cooloff_hours: 24 },
    now: new Date("2026-09-18T10:00:00Z"),
  });
  const otherSymbol = evaluateSymbolLossReentryLockout({
    action: "BUY",
    proposedSymbol: "BBB",
    fills,
    policy: { loss_reentry_cooloff_hours: 24 },
    now: new Date("2026-09-18T10:00:00Z"),
  });

  assert.equal(sameSymbol.approved, false);
  assert.equal(sameSymbol.metrics.lockout_active, true);
  assert.equal(otherSymbol.approved, true);
});

test("symbol loss re-entry lockout expires after configured cool-off", () => {
  const result = evaluateSymbolLossReentryLockout({
    action: "BUY",
    proposedSymbol: "AAA",
    fills: [
      { ...fill({ order: "o1", pnl: -10, time: "2026-09-17T08:00:00Z" }), symbol: "AAA" },
    ],
    policy: { loss_reentry_cooloff_hours: 24 },
    now: new Date("2026-09-18T09:00:00Z"),
  });

  assert.equal(result.approved, true);
  assert.equal(result.metrics.lockout_active, false);
});

test("SELL remains available during active loss-streak cool-off", () => {
  const result = evaluateLossStreakCooloff({
    action: "SELL",
    fills: [
      fill({ order: "o3", pnl: -5, time: "2026-09-18T08:00:00Z" }),
      fill({ order: "o2", pnl: -10, time: "2026-09-18T06:00:00Z" }),
      fill({ order: "o1", pnl: -8, time: "2026-09-18T04:00:00Z" }),
    ],
    policy: {
      max_consecutive_losing_closes: 3,
      loss_streak_cooloff_hours: 24,
    },
    now: new Date("2026-09-18T10:00:00Z"),
  });

  assert.equal(result.approved, true);
  assert.equal(result.metrics.cooloff_active, true);
});
