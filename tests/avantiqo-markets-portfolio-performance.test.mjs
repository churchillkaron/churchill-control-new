import assert from "node:assert/strict";
import test from "node:test";

import {
  dailyEquitySeries,
  equityReturns,
  maximumDrawdownPct,
  summarizePortfolioPerformance,
} from "../lib/markets/runtime/MarketPortfolioPerformanceModels.js";

function snapshots(values) {
  return values.map((equity, index) => ({
    equity,
    recorded_at: new Date(Date.UTC(2026, 0, 1 + index)).toISOString(),
  }));
}

test("daily equity series keeps the last snapshot per day", () => {
  const rows = dailyEquitySeries([
    { equity: 100000, recorded_at: "2026-01-01T10:00:00Z" },
    { equity: 101000, recorded_at: "2026-01-01T20:00:00Z" },
    { equity: 102000, recorded_at: "2026-01-02T20:00:00Z" },
  ]);
  assert.equal(rows.length, 2);
  assert.equal(Number(rows[0].equity), 101000);
});

test("equity returns derive close-to-close portfolio returns", () => {
  const values = equityReturns(snapshots([100000, 101000, 99990]));
  assert.equal(values.length, 2);
  assert.ok(Math.abs(values[0] - 0.01) < 1e-12);
});

test("maximum drawdown measures peak-to-trough decline", () => {
  const drawdown = maximumDrawdownPct(snapshots([100000, 110000, 88000, 95000]));
  assert.ok(Math.abs(drawdown - 20) < 1e-12);
});

test("risk-adjusted statistics fail closed on short history", () => {
  const result = summarizePortfolioPerformance({
    snapshots: snapshots([100000, 101000, 100500, 102000]),
  });
  assert.equal(result.risk_adjusted_history_sufficient, false);
  assert.equal(result.sharpe_ratio, null);
  assert.equal(result.sortino_ratio, null);
  assert.ok(result.total_return > 0);
});

test("mature daily history produces bounded performance statistics", () => {
  const values = Array.from({ length: 35 }, (_, index) => {
    const trend = 100000 * (1 + (index * 0.0015));
    const wave = index % 5 === 0 ? -450 : 250;
    return trend + wave;
  });
  const result = summarizePortfolioPerformance({
    snapshots: snapshots(values),
    riskFreeRateAnnual: 0,
    minimumRiskAdjustedObservations: 20,
  });

  assert.equal(result.risk_adjusted_history_sufficient, true);
  assert.ok(Number.isFinite(result.annualized_volatility));
  assert.ok(Number.isFinite(result.sharpe_ratio));
  assert.ok(result.max_drawdown_pct >= 0);
  assert.ok(result.observation_days >= 30);
});
