import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateAutonomousPaperOrder,
  researchRefreshRequired,
} from "../lib/markets/runtime/MarketAutonomousPaperModels.js";

const base = {
  automationPolicy: {
    auto_paper_enabled: true,
    kill_switch: false,
    target_position_pct: 2,
    min_confidence: 0.75,
    allow_buys: true,
    allow_sells: true,
  },
  riskPolicy: {
    min_decision_confidence: 0.7,
    max_position_pct: 10,
    max_order_notional: null,
  },
  account: {
    equity: 100000,
    cash_balance: 100000,
  },
};

test("autonomous paper trading is disabled unless explicitly enabled", () => {
  const result = calculateAutonomousPaperOrder({
    ...base,
    automationPolicy: { ...base.automationPolicy, auto_paper_enabled: false },
    decision: { action: "BUY", confidence: 0.9 },
    marketPrice: 100,
  });
  assert.equal(result.executable, false);
  assert.equal(result.reason, "AUTO_PAPER_DISABLED");
});

test("kill switch always blocks automation", () => {
  const result = calculateAutonomousPaperOrder({
    ...base,
    automationPolicy: { ...base.automationPolicy, kill_switch: true },
    decision: { action: "BUY", confidence: 0.95 },
    marketPrice: 100,
  });
  assert.equal(result.executable, false);
  assert.equal(result.reason, "AUTOMATION_KILL_SWITCH");
});

test("BUY quantity is derived from bounded target position", () => {
  const result = calculateAutonomousPaperOrder({
    ...base,
    decision: { action: "BUY", confidence: 0.875 },
    marketPrice: 100,
    position: { quantity: 0 },
  });
  assert.equal(result.executable, true);
  assert.equal(result.side, "BUY");
  assert.ok(result.notional > 1000);
  assert.ok(result.notional <= 2000);
  assert.equal(result.quantity, result.notional / 100);
});

test("BUY does nothing when target is already reached", () => {
  const result = calculateAutonomousPaperOrder({
    ...base,
    decision: { action: "BUY", confidence: 0.9 },
    marketPrice: 100,
    position: { quantity: 20 },
  });
  assert.equal(result.executable, false);
  assert.equal(result.reason, "TARGET_POSITION_ALREADY_REACHED");
});

test("SELL exits only an existing long paper position", () => {
  const result = calculateAutonomousPaperOrder({
    ...base,
    decision: { action: "SELL", confidence: 0.9 },
    marketPrice: 100,
    position: { quantity: 12 },
  });
  assert.equal(result.executable, true);
  assert.equal(result.side, "SELL");
  assert.equal(result.quantity, 12);
  assert.equal(result.notional, 1200);
});

test("SELL cannot create a short position", () => {
  const result = calculateAutonomousPaperOrder({
    ...base,
    decision: { action: "SELL", confidence: 0.9 },
    marketPrice: 100,
    position: { quantity: 0 },
  });
  assert.equal(result.executable, false);
  assert.equal(result.reason, "NO_LONG_POSITION_TO_SELL");
});

test("research refresh becomes due after configured age", () => {
  assert.equal(researchRefreshRequired({
    lastResearchAt: "2026-09-18T06:00:00Z",
    now: new Date("2026-09-18T12:30:00Z"),
    maxAgeMinutes: 360,
  }), true);

  assert.equal(researchRefreshRequired({
    lastResearchAt: "2026-09-18T10:00:00Z",
    now: new Date("2026-09-18T12:30:00Z"),
    maxAgeMinutes: 360,
  }), false);

  assert.equal(researchRefreshRequired({
    lastResearchAt: null,
    now: new Date("2026-09-18T12:30:00Z"),
    maxAgeMinutes: 360,
  }), true);
});
