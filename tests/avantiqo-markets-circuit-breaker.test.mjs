import assert from "node:assert/strict";
import test from "node:test";

import { evaluatePortfolioCircuitBreaker } from "../lib/markets/runtime/MarketCircuitBreakerModels.js";

test("daily-loss breach triggers deterministic circuit breaker", () => {
  const result = evaluatePortfolioCircuitBreaker({
    policy: {
      max_daily_loss_pct: 2,
      max_portfolio_drawdown_pct: 10,
    },
    account: {
      daily_equity_start: 100000,
      high_water_equity: 105000,
    },
    marked: {
      equity: 97500,
    },
  });

  assert.equal(result.breached, true);
  assert.ok(result.reasons.includes("MAX_DAILY_LOSS_BREACH"));
  assert.ok(result.metrics.daily_loss_pct > 2);
});

test("drawdown breach triggers independently of daily loss", () => {
  const result = evaluatePortfolioCircuitBreaker({
    policy: {
      max_daily_loss_pct: 5,
      max_portfolio_drawdown_pct: 10,
    },
    account: {
      daily_equity_start: 90000,
      high_water_equity: 110000,
    },
    marked: {
      equity: 98000,
    },
  });

  assert.equal(result.breached, true);
  assert.deepEqual(result.reasons, ["MAX_PORTFOLIO_DRAWDOWN_BREACH"]);
});

test("portfolio inside both limits remains active", () => {
  const result = evaluatePortfolioCircuitBreaker({
    policy: {
      max_daily_loss_pct: 3,
      max_portfolio_drawdown_pct: 12,
    },
    account: {
      daily_equity_start: 100000,
      high_water_equity: 102000,
    },
    marked: {
      equity: 99500,
    },
  });

  assert.equal(result.breached, false);
  assert.deepEqual(result.reasons, []);
});
