import assert from "node:assert/strict";
import test from "node:test";

import {
  averageDailyDollarVolume,
  evaluateLiquidityCapacity,
} from "../lib/markets/runtime/MarketLiquidityCapacityModels.js";

const bars = Array.from({ length: 20 }, (_, index) => ({
  bar_time: `2026-08-${String(index + 1).padStart(2, "0")}T00:00:00Z`,
  close: 100,
  volume: 100000,
}));

test("average daily dollar volume derives from point-in-time daily bars", () => {
  const result = averageDailyDollarVolume(bars, 20);
  assert.equal(result.observations, 20);
  assert.equal(result.average_daily_dollar_volume, 10000000);
});

test("liquidity capacity admits bounded BUY", () => {
  const result = evaluateLiquidityCapacity({
    action: "BUY",
    positions: [{ symbol: "AAA", market_value: 250000 }],
    proposedSymbol: "AAA",
    proposedNotional: 250000,
    bars,
    policy: {
      liquidity_adv_window_days: 20,
      liquidity_min_observations: 15,
      max_position_adv_pct: 10,
      liquidation_participation_pct: 10,
      max_days_to_liquidate: 5,
    },
  });

  assert.equal(result.approved, true);
  assert.equal(result.metrics.projected_position_adv_pct, 5);
  assert.equal(result.metrics.projected_days_to_liquidate, 0.5);
});

test("projected position above ADV capacity is blocked", () => {
  const result = evaluateLiquidityCapacity({
    action: "BUY",
    positions: [],
    proposedSymbol: "AAA",
    proposedNotional: 1500000,
    bars,
    policy: {
      liquidity_adv_window_days: 20,
      liquidity_min_observations: 15,
      max_position_adv_pct: 10,
      liquidation_participation_pct: 10,
      max_days_to_liquidate: 5,
    },
  });

  assert.equal(result.approved, false);
  assert.match(result.reasons.join(" "), /daily-volume/i);
});

test("insufficient ADV history fails closed for BUY", () => {
  const result = evaluateLiquidityCapacity({
    action: "BUY",
    positions: [],
    proposedSymbol: "AAA",
    proposedNotional: 10000,
    bars: bars.slice(0, 5),
    policy: {
      liquidity_adv_window_days: 20,
      liquidity_min_observations: 15,
    },
  });

  assert.equal(result.approved, false);
  assert.match(result.reasons.join(" "), /insufficient/i);
});

test("SELL de-risking remains available despite weak liquidity evidence", () => {
  const result = evaluateLiquidityCapacity({
    action: "SELL",
    positions: [{ symbol: "AAA", market_value: 5000000 }],
    proposedSymbol: "AAA",
    proposedNotional: 5000000,
    bars: [],
    policy: {
      liquidity_min_observations: 15,
      max_position_adv_pct: 1,
      max_days_to_liquidate: 1,
    },
  });

  assert.equal(result.approved, true);
});
