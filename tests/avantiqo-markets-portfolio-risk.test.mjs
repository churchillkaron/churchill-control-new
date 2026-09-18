import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluatePortfolioConcentration,
  pearsonCorrelation,
  returnsFromBars,
} from "../lib/markets/runtime/MarketPortfolioRiskModels.js";

test("pearson correlation identifies strongly aligned returns", () => {
  const left = [0.01, 0.02, -0.01, 0.03, 0.015, -0.02, 0.01, 0.025, -0.005, 0.02, 0.01, -0.01];
  const right = left.map((value) => value * 1.8);
  const correlation = pearsonCorrelation(left, right);
  assert.ok(correlation > 0.99);
});

test("returnsFromBars derives ordered close-to-close returns", () => {
  const returns = returnsFromBars([
    { bar_time: "2026-09-03", close: 110 },
    { bar_time: "2026-09-01", close: 100 },
    { bar_time: "2026-09-02", close: 105 },
  ]);
  assert.equal(returns.length, 2);
  assert.ok(Math.abs(returns[0] - 0.05) < 1e-12);
});

test("rejects projected gross exposure above policy", () => {
  const result = evaluatePortfolioConcentration({
    policy: {
      max_gross_exposure_pct: 50,
      max_sector_pct: 100,
      max_correlated_exposure_pct: 100,
      correlation_threshold: 0.8,
    },
    equity: 100000,
    positions: [{ symbol: "AAA", market_value: 45000 }],
    proposed: { symbol: "BBB", side: "BUY", notional: 10000 },
    sectorBySymbol: { AAA: "Manufacturing", BBB: "Services" },
    returnsBySymbol: {},
  });

  assert.equal(result.approved, false);
  assert.ok(result.reasons.some((reason) => reason.includes("gross exposure")));
  assert.ok(Math.abs(result.metrics.projected_gross_exposure_pct - 55) < 1e-9);
});

test("rejects projected sector concentration above policy", () => {
  const result = evaluatePortfolioConcentration({
    policy: {
      max_gross_exposure_pct: 100,
      max_sector_pct: 30,
      max_correlated_exposure_pct: 100,
      correlation_threshold: 0.8,
    },
    equity: 100000,
    positions: [{ symbol: "AAA", market_value: 25000 }],
    proposed: { symbol: "BBB", side: "BUY", notional: 10000 },
    sectorBySymbol: { AAA: "Manufacturing", BBB: "Manufacturing" },
    returnsBySymbol: {},
  });

  assert.equal(result.approved, false);
  assert.ok(result.reasons.some((reason) => reason.includes("sector exposure")));
  assert.equal(result.metrics.projected_sector_exposure_pct, 35);
});

test("rejects correlated cluster exposure above policy", () => {
  const baseReturns = [0.01, 0.02, -0.01, 0.03, 0.015, -0.02, 0.01, 0.025, -0.005, 0.02, 0.01, -0.01];
  const result = evaluatePortfolioConcentration({
    policy: {
      max_gross_exposure_pct: 100,
      max_sector_pct: 100,
      max_correlated_exposure_pct: 25,
      correlation_threshold: 0.8,
    },
    equity: 100000,
    positions: [{ symbol: "AAA", market_value: 20000 }],
    proposed: { symbol: "BBB", side: "BUY", notional: 10000 },
    sectorBySymbol: { AAA: "Manufacturing", BBB: "Services" },
    returnsBySymbol: {
      AAA: baseReturns,
      BBB: baseReturns.map((value) => value * 0.8),
    },
  });

  assert.equal(result.approved, false);
  assert.ok(result.reasons.some((reason) => reason.includes("correlated exposure")));
  assert.ok(result.metrics.projected_correlated_exposure_pct > 25);
});

test("SELL de-risks gross and sector exposure", () => {
  const result = evaluatePortfolioConcentration({
    policy: {
      max_gross_exposure_pct: 50,
      max_sector_pct: 30,
      max_correlated_exposure_pct: 35,
      correlation_threshold: 0.8,
    },
    equity: 100000,
    positions: [{ symbol: "AAA", market_value: 35000 }],
    proposed: { symbol: "AAA", side: "SELL", notional: 10000 },
    sectorBySymbol: { AAA: "Manufacturing" },
    returnsBySymbol: { AAA: [] },
  });

  assert.equal(result.approved, true);
  assert.equal(result.metrics.projected_gross_exposure_pct, 25);
  assert.equal(result.metrics.projected_sector_exposure_pct, 25);
});
