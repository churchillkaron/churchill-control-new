import assert from "node:assert/strict";
import test from "node:test";

import {
  betaToBenchmark,
  calculatePortfolioRiskBudgetScale,
  evaluatePortfolioBetaRisk,
  evaluatePortfolioConcentration,
  evaluatePortfolioStressRisk,
  pearsonCorrelation,
  returnsFromBars,
} from "../lib/markets/runtime/MarketPortfolioRiskModels.js";

test("pearson correlation identifies strongly aligned returns", () => {
  const left = [0.01, 0.02, -0.01, 0.03, 0.015, -0.02, 0.01, 0.025, -0.005, 0.02, 0.01, -0.01];
  const right = left.map((value) => value * 1.8);
  const correlation = pearsonCorrelation(left, right);
  assert.ok(correlation > 0.99);
});

test("benchmark beta identifies proportional systematic exposure", () => {
  const benchmark = Array.from({ length: 80 }, (_, index) => (
    index % 4 === 0 ? -0.01 : 0.006 + ((index % 3) * 0.001)
  ));
  const asset = benchmark.map((value) => value * 1.8);
  const beta = betaToBenchmark(asset, benchmark);

  assert.ok(Math.abs(beta - 1.8) < 1e-9);
});

test("projected beta above owner ceiling blocks BUY but not SELL", () => {
  const benchmark = Array.from({ length: 80 }, (_, index) => (
    index % 4 === 0 ? -0.01 : 0.006 + ((index % 3) * 0.001)
  ));
  const highBeta = benchmark.map((value) => value * 2);

  const buy = evaluatePortfolioBetaRisk({
    policy: {
      historical_risk_min_observations: 60,
      max_portfolio_beta: 1.5,
    },
    equity: 100000,
    positions: [{ symbol: "AAA", market_value: 90000 }],
    proposed: { symbol: "BBB", side: "BUY", notional: 10000 },
    returnsBySymbol: {
      AAA: highBeta,
      BBB: highBeta,
    },
    benchmarkReturns: benchmark,
    benchmarkSymbol: "SPY",
  });
  const sell = evaluatePortfolioBetaRisk({
    policy: {
      historical_risk_min_observations: 60,
      max_portfolio_beta: 1.5,
    },
    equity: 100000,
    positions: [{ symbol: "AAA", market_value: 90000 }],
    proposed: { symbol: "AAA", side: "SELL", notional: 10000 },
    returnsBySymbol: { AAA: highBeta },
    benchmarkReturns: benchmark,
    benchmarkSymbol: "SPY",
  });

  assert.equal(buy.approved, false);
  assert.ok(buy.metrics.projected_beta > 1.5);
  assert.equal(sell.approved, true);
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

test("risk-budget scale stays at one below soft utilization", () => {
  const result = calculatePortfolioRiskBudgetScale({
    metrics: {
      projected_gross_exposure_pct: 50,
      projected_sector_exposure_pct: 15,
      projected_correlated_exposure_pct: 20,
      candidate_sector: "Services",
      historical_risk: {
        portfolio: {
          var_95_pct: 2,
          expected_shortfall_95_pct: 3,
        },
      },
    },
    policy: {
      max_gross_exposure_pct: 100,
      max_sector_pct: 30,
      max_correlated_exposure_pct: 35,
      max_portfolio_var_95_pct: 5,
      max_portfolio_expected_shortfall_95_pct: 8,
    },
  });

  assert.equal(result.scale, 1);
  assert.ok(result.max_utilization < 0.7);
});

test("risk-budget scale shrinks smoothly near a hard limit", () => {
  const result = calculatePortfolioRiskBudgetScale({
    metrics: {
      projected_gross_exposure_pct: 90,
      projected_sector_exposure_pct: 10,
      projected_correlated_exposure_pct: 10,
      candidate_sector: "Services",
      historical_risk: {
        portfolio: {
          var_95_pct: 1,
          expected_shortfall_95_pct: 2,
        },
      },
    },
    policy: {
      max_gross_exposure_pct: 100,
      max_sector_pct: 30,
      max_correlated_exposure_pct: 35,
      max_portfolio_var_95_pct: 5,
      max_portfolio_expected_shortfall_95_pct: 8,
    },
    softLimitStart: 0.7,
    minimumScale: 0.25,
  });

  assert.equal(result.binding_dimension, "GROSS_EXPOSURE");
  assert.ok(Math.abs(result.max_utilization - 0.9) < 1e-12);
  assert.ok(result.scale > 0.25);
  assert.ok(result.scale < 1);
});

test("incremental risk can become the binding soft risk budget", () => {
  const result = calculatePortfolioRiskBudgetScale({
    metrics: {
      projected_gross_exposure_pct: 20,
      projected_sector_exposure_pct: 10,
      projected_correlated_exposure_pct: 10,
      candidate_sector: "Services",
      historical_risk: {
        portfolio: {
          var_95_pct: 1,
          expected_shortfall_95_pct: 2,
        },
        incremental_var_95_pct: 1.35,
        incremental_expected_shortfall_95_pct: 1,
      },
      stress_risk: {
        worst_scenario: { loss_pct_equity: 3 },
      },
      benchmark_beta: { projected_beta: 0.8 },
      liquidity_capacity: {
        projected_position_adv_pct: 3,
        projected_days_to_liquidate: 1,
      },
    },
    policy: {
      max_gross_exposure_pct: 100,
      max_sector_pct: 30,
      max_correlated_exposure_pct: 35,
      max_portfolio_var_95_pct: 5,
      max_portfolio_expected_shortfall_95_pct: 8,
      max_incremental_var_95_pct: 1.5,
      max_incremental_expected_shortfall_95_pct: 2.5,
      max_portfolio_stress_loss_pct: 12,
      max_portfolio_beta: 1.5,
      max_position_adv_pct: 10,
      max_days_to_liquidate: 5,
    },
  });

  assert.equal(result.binding_dimension, "INCREMENTAL_VAR_95");
  assert.ok(Math.abs(result.max_utilization - 0.9) < 1e-12);
  assert.ok(result.scale < 1);
});

test("liquidity capacity can become the binding soft risk budget", () => {
  const result = calculatePortfolioRiskBudgetScale({
    metrics: {
      projected_gross_exposure_pct: 20,
      projected_sector_exposure_pct: 10,
      projected_correlated_exposure_pct: 10,
      candidate_sector: "Services",
      historical_risk: {
        portfolio: {
          var_95_pct: 1,
          expected_shortfall_95_pct: 2,
        },
      },
      stress_risk: {
        worst_scenario: {
          loss_pct_equity: 3,
        },
      },
      benchmark_beta: {
        projected_beta: 0.8,
      },
      liquidity_capacity: {
        projected_position_adv_pct: 9,
        projected_days_to_liquidate: 2,
      },
    },
    policy: {
      max_gross_exposure_pct: 100,
      max_sector_pct: 30,
      max_correlated_exposure_pct: 35,
      max_portfolio_var_95_pct: 5,
      max_portfolio_expected_shortfall_95_pct: 8,
      max_portfolio_stress_loss_pct: 12,
      max_portfolio_beta: 1.5,
      max_position_adv_pct: 10,
      max_days_to_liquidate: 5,
    },
  });

  assert.equal(result.binding_dimension, "POSITION_ADV_CAPACITY");
  assert.ok(Math.abs(result.max_utilization - 0.9) < 1e-12);
  assert.ok(result.scale < 1);
});

test("portfolio beta can become the binding soft risk budget", () => {
  const result = calculatePortfolioRiskBudgetScale({
    metrics: {
      projected_gross_exposure_pct: 30,
      projected_sector_exposure_pct: 10,
      projected_correlated_exposure_pct: 10,
      candidate_sector: "Services",
      historical_risk: {
        portfolio: {
          var_95_pct: 1,
          expected_shortfall_95_pct: 2,
        },
      },
      stress_risk: {
        worst_scenario: {
          loss_pct_equity: 3,
        },
      },
      benchmark_beta: {
        projected_beta: 1.35,
      },
    },
    policy: {
      max_gross_exposure_pct: 100,
      max_sector_pct: 30,
      max_correlated_exposure_pct: 35,
      max_portfolio_var_95_pct: 5,
      max_portfolio_expected_shortfall_95_pct: 8,
      max_portfolio_stress_loss_pct: 12,
      max_portfolio_beta: 1.5,
    },
  });

  assert.equal(result.binding_dimension, "PORTFOLIO_BETA");
  assert.ok(Math.abs(result.max_utilization - 0.9) < 1e-12);
  assert.ok(result.scale < 1);
});

test("stress loss can become the binding soft risk budget", () => {
  const result = calculatePortfolioRiskBudgetScale({
    metrics: {
      projected_gross_exposure_pct: 30,
      projected_sector_exposure_pct: 10,
      projected_correlated_exposure_pct: 10,
      candidate_sector: "Services",
      historical_risk: {
        portfolio: {
          var_95_pct: 1,
          expected_shortfall_95_pct: 2,
        },
      },
      stress_risk: {
        worst_scenario: {
          id: "SINGLE_NAME_GAP",
          loss_pct_equity: 10.8,
        },
      },
    },
    policy: {
      max_gross_exposure_pct: 100,
      max_sector_pct: 30,
      max_correlated_exposure_pct: 35,
      max_portfolio_var_95_pct: 5,
      max_portfolio_expected_shortfall_95_pct: 8,
      max_portfolio_stress_loss_pct: 12,
    },
  });

  assert.equal(result.binding_dimension, "STRESS_LOSS");
  assert.ok(Math.abs(result.max_utilization - 0.9) < 1e-12);
  assert.ok(result.scale < 1);
});

test("risk-budget scale bottoms at configured floor at hard limit", () => {
  const result = calculatePortfolioRiskBudgetScale({
    metrics: {
      projected_gross_exposure_pct: 100,
      projected_sector_exposure_pct: 10,
      projected_correlated_exposure_pct: 10,
      candidate_sector: "Services",
      historical_risk: {
        portfolio: {
          var_95_pct: 1,
          expected_shortfall_95_pct: 2,
        },
      },
    },
    policy: {
      max_gross_exposure_pct: 100,
      max_sector_pct: 30,
      max_correlated_exposure_pct: 35,
      max_portfolio_var_95_pct: 5,
      max_portfolio_expected_shortfall_95_pct: 8,
    },
    minimumScale: 0.25,
  });

  assert.equal(result.scale, 0.25);
});

test("portfolio stress gate rejects BUY when worst scenario exceeds cap", () => {
  const aligned = [0.01, 0.02, -0.01, 0.03, 0.015, -0.02, 0.01, 0.025, -0.005, 0.02, 0.01, -0.01];
  const result = evaluatePortfolioStressRisk({
    policy: {
      max_portfolio_stress_loss_pct: 8,
      stress_market_shock_pct: 10,
      stress_sector_shock_pct: 12,
      stress_correlated_cluster_shock_pct: 18,
      stress_single_name_shock_pct: 25,
      correlation_threshold: 0.8,
    },
    equity: 100000,
    positions: [
      { symbol: "AAA", market_value: 30000 },
      { symbol: "CCC", market_value: 20000 },
    ],
    proposed: {
      symbol: "BBB",
      side: "BUY",
      notional: 20000,
    },
    sectorBySymbol: {
      AAA: "Technology",
      BBB: "Technology",
      CCC: "Consumer",
    },
    returnsBySymbol: {
      AAA: aligned,
      BBB: aligned.map((value) => value * 0.9),
      CCC: aligned.map((value) => -value * 0.2),
    },
  });

  assert.equal(result.approved, false);
  assert.ok(result.metrics.worst_scenario);
  assert.ok(result.metrics.worst_scenario.loss_pct_equity > 8);
  assert.match(result.reasons.join(" "), /stress loss/i);
});

test("portfolio stress scenarios calculate market sector cluster and single-name losses", () => {
  const aligned = [0.01, 0.02, -0.01, 0.03, 0.015, -0.02, 0.01, 0.025, -0.005, 0.02, 0.01, -0.01];
  const result = evaluatePortfolioStressRisk({
    policy: {
      max_portfolio_stress_loss_pct: 100,
      stress_market_shock_pct: 8,
      stress_sector_shock_pct: 12,
      stress_correlated_cluster_shock_pct: 15,
      stress_single_name_shock_pct: 20,
      correlation_threshold: 0.8,
    },
    equity: 100000,
    positions: [{ symbol: "AAA", market_value: 25000 }],
    proposed: {
      symbol: "BBB",
      side: "BUY",
      notional: 10000,
    },
    sectorBySymbol: {
      AAA: "Technology",
      BBB: "Technology",
    },
    returnsBySymbol: {
      AAA: aligned,
      BBB: aligned,
    },
  });

  const byId = Object.fromEntries(
    result.metrics.scenarios.map((row) => [row.id, row]),
  );

  assert.ok(byId.MARKET_SELLOFF.loss_pct_equity > 0);
  assert.ok(byId.SECTOR_SELLOFF.loss_pct_equity > 0);
  assert.ok(byId.CORRELATED_CLUSTER_SELLOFF.loss_pct_equity > 0);
  assert.ok(byId.SINGLE_NAME_GAP.loss_pct_equity > 0);
});

test("portfolio stress gate preserves SELL de-risking", () => {
  const result = evaluatePortfolioStressRisk({
    policy: {
      max_portfolio_stress_loss_pct: 1,
      stress_market_shock_pct: 20,
      stress_sector_shock_pct: 20,
      stress_correlated_cluster_shock_pct: 20,
      stress_single_name_shock_pct: 20,
    },
    equity: 100000,
    positions: [{ symbol: "AAA", market_value: 50000 }],
    proposed: {
      symbol: "AAA",
      side: "SELL",
      notional: 25000,
    },
    sectorBySymbol: { AAA: "Technology" },
    returnsBySymbol: { AAA: [] },
  });

  assert.equal(result.approved, true);
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
