import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateHistoricalPortfolioRisk,
  historicalRiskMetrics,
  projectedPortfolioReturns,
} from "../lib/markets/runtime/MarketPortfolioRiskModels.js";

test("historical risk metrics produce volatility VaR and expected shortfall", () => {
  const returns = Array.from({ length: 100 }, (_, index) => (
    index % 20 === 0 ? -0.04 : index % 7 === 0 ? -0.01 : 0.002
  ));
  const metrics = historicalRiskMetrics(returns, 0.95);

  assert.equal(metrics.observations, 100);
  assert.ok(metrics.annualized_volatility_pct > 0);
  assert.ok(metrics.var_95_pct >= 1);
  assert.ok(metrics.expected_shortfall_95_pct >= metrics.var_95_pct);
});

test("projected portfolio returns use projected market-value weights", () => {
  const projected = projectedPortfolioReturns({
    equity: 1000,
    positions: [
      { symbol: "AAA", market_value: 500 },
    ],
    proposed: {
      symbol: "BBB",
      side: "BUY",
      notional: 250,
    },
    returnsBySymbol: {
      AAA: [0.01, 0.02, -0.01],
      BBB: [0.02, -0.02, 0.01],
    },
  });

  assert.equal(projected.length, 3);
  assert.ok(Math.abs(projected[0] - 0.01) < 1e-12);
});

test("new BUY fails closed with insufficient historical observations", () => {
  const result = evaluateHistoricalPortfolioRisk({
    policy: {
      historical_risk_min_observations: 60,
    },
    equity: 100000,
    positions: [],
    proposed: {
      symbol: "AAA",
      side: "BUY",
      notional: 5000,
    },
    returnsBySymbol: {
      AAA: Array(20).fill(0.001),
    },
  });

  assert.equal(result.approved, false);
  assert.match(result.reasons.join(" "), /insufficient/i);
});

test("SELL de-risking remains allowed when history is sparse", () => {
  const result = evaluateHistoricalPortfolioRisk({
    policy: {
      historical_risk_min_observations: 60,
    },
    equity: 100000,
    positions: [
      { symbol: "AAA", market_value: 10000 },
    ],
    proposed: {
      symbol: "AAA",
      side: "SELL",
      notional: 5000,
    },
    returnsBySymbol: {
      AAA: Array(10).fill(-0.01),
    },
  });

  assert.equal(result.approved, true);
});

test("BUY is rejected when incremental risk contribution exceeds tighter trade cap", () => {
  const moderate = Array.from({ length: 100 }, (_, index) => (
    index % 10 === 0 ? -0.05 : 0.003
  ));
  const result = evaluateHistoricalPortfolioRisk({
    policy: {
      historical_risk_min_observations: 60,
      max_portfolio_var_95_pct: 10,
      max_portfolio_expected_shortfall_95_pct: 20,
      max_incremental_var_95_pct: 0.2,
      max_incremental_expected_shortfall_95_pct: 0.4,
      max_position_annualized_volatility_pct: 1000,
    },
    equity: 100000,
    positions: [],
    proposed: {
      symbol: "AAA",
      side: "BUY",
      notional: 50000,
    },
    returnsBySymbol: {
      AAA: moderate,
    },
  });

  assert.ok(result.metrics.portfolio.var_95_pct < 10);
  assert.ok(result.metrics.incremental_var_95_pct > 0.2);
  assert.equal(result.approved, false);
  assert.match(result.reasons.join(" "), /Incremental 95% VaR/i);
});

test("SELL de-risking is not blocked by incremental risk caps", () => {
  const volatile = Array.from({ length: 100 }, (_, index) => (
    index % 10 === 0 ? -0.08 : 0.004
  ));
  const result = evaluateHistoricalPortfolioRisk({
    policy: {
      historical_risk_min_observations: 60,
      max_incremental_var_95_pct: 0.01,
      max_incremental_expected_shortfall_95_pct: 0.01,
    },
    equity: 100000,
    positions: [{ symbol: "AAA", market_value: 50000 }],
    proposed: {
      symbol: "AAA",
      side: "SELL",
      notional: 25000,
    },
    returnsBySymbol: {
      AAA: volatile,
    },
  });

  assert.equal(result.approved, true);
});

test("BUY is rejected when projected historical VaR exceeds owner limit", () => {
  const volatile = Array.from({ length: 100 }, (_, index) => (
    index % 10 === 0 ? -0.12 : 0.01
  ));
  const result = evaluateHistoricalPortfolioRisk({
    policy: {
      historical_risk_min_observations: 60,
      max_portfolio_var_95_pct: 0.25,
      max_portfolio_expected_shortfall_95_pct: 0.5,
      max_position_annualized_volatility_pct: 1000,
    },
    equity: 100000,
    positions: [],
    proposed: {
      symbol: "AAA",
      side: "BUY",
      notional: 100000,
    },
    returnsBySymbol: {
      AAA: volatile,
    },
  });

  assert.equal(result.approved, false);
  assert.match(result.reasons.join(" "), /VaR/i);
});
