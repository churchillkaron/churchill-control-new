import assert from "node:assert/strict";
import test from "node:test";

import {
  applyPortfolioRiskBudgetToSizing,
  calculateAutonomousPaperOrder,
  researchRefreshRequired,
} from "../lib/markets/runtime/MarketAutonomousPaperModels.js";

const base = {
  automationPolicy: {
    auto_paper_enabled: true,
    kill_switch: false,
    target_position_pct: 2,
    target_annualized_volatility_pct: 25,
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

test("high volatility scales autonomous BUY target down", () => {
  const baseline = calculateAutonomousPaperOrder({
    ...base,
    decision: { action: "BUY", confidence: 0.875 },
    marketPrice: 100,
    position: { quantity: 0 },
    candidateAnnualizedVolatilityPct: 25,
  });
  const volatile = calculateAutonomousPaperOrder({
    ...base,
    decision: { action: "BUY", confidence: 0.875 },
    marketPrice: 100,
    position: { quantity: 0 },
    candidateAnnualizedVolatilityPct: 50,
  });

  assert.equal(baseline.executable, true);
  assert.equal(volatile.executable, true);
  assert.ok(Math.abs(volatile.volatility_scale - 0.5) < 1e-12);
  assert.ok(Math.abs(volatile.target_position_pct - (baseline.target_position_pct * 0.5)) < 1e-12);
  assert.ok(Math.abs(volatile.notional - (baseline.notional * 0.5)) < 1e-9);
});

test("low volatility keeps the confidence-scaled target", () => {
  const result = calculateAutonomousPaperOrder({
    ...base,
    decision: { action: "BUY", confidence: 0.875 },
    marketPrice: 100,
    position: { quantity: 0 },
    candidateAnnualizedVolatilityPct: 15,
  });

  assert.equal(result.executable, true);
  assert.equal(result.volatility_scale, 1);
  assert.equal(result.target_position_pct, result.confidence_scaled_target_position_pct);
});

test("risk-off regime scales autonomous BUY target down", () => {
  const normal = calculateAutonomousPaperOrder({
    ...base,
    decision: { action: "BUY", confidence: 0.875 },
    marketPrice: 100,
    position: { quantity: 0 },
    candidateAnnualizedVolatilityPct: 25,
    marketRegimeSizingScale: 1,
  });
  const riskOff = calculateAutonomousPaperOrder({
    ...base,
    decision: { action: "BUY", confidence: 0.875 },
    marketPrice: 100,
    position: { quantity: 0 },
    candidateAnnualizedVolatilityPct: 25,
    marketRegimeSizingScale: 0.5,
  });

  assert.equal(normal.executable, true);
  assert.equal(riskOff.executable, true);
  assert.equal(riskOff.market_regime_sizing_scale, 0.5);
  assert.ok(Math.abs(riskOff.notional - (normal.notional * 0.5)) < 1e-9);
});

test("portfolio risk budget reduces BUY notional and quantity proportionally", () => {
  const sizing = calculateAutonomousPaperOrder({
    ...base,
    decision: { action: "BUY", confidence: 0.875 },
    marketPrice: 100,
    position: { quantity: 0 },
    candidateAnnualizedVolatilityPct: 25,
  });
  const adjusted = applyPortfolioRiskBudgetToSizing({
    sizing,
    riskBudget: {
      scale: 0.6,
      binding_dimension: "CORRELATED_EXPOSURE",
      max_utilization: 0.86,
      utilizations: { CORRELATED_EXPOSURE: 0.86 },
    },
    equity: 100000,
    heldValue: 0,
  });

  assert.equal(adjusted.executable, true);
  assert.ok(Math.abs(adjusted.notional - (sizing.notional * 0.6)) < 1e-9);
  assert.ok(Math.abs(adjusted.quantity - (sizing.quantity * 0.6)) < 1e-12);
  assert.equal(adjusted.risk_budget_scale, 0.6);
  assert.equal(adjusted.risk_budget_binding_dimension, "CORRELATED_EXPOSURE");
});

test("portfolio risk budget does not alter SELL de-risking", () => {
  const sizing = calculateAutonomousPaperOrder({
    ...base,
    decision: { action: "SELL", confidence: 0.9 },
    marketPrice: 100,
    position: { quantity: 12 },
  });
  const adjusted = applyPortfolioRiskBudgetToSizing({
    sizing,
    riskBudget: { scale: 0.25 },
    equity: 100000,
    heldValue: 1200,
  });

  assert.deepEqual(adjusted, sizing);
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
