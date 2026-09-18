import assert from "node:assert/strict";
import test from "node:test";

import { evaluateHistoricalDataFreshness } from "../lib/markets/runtime/MarketHistoricalDataFreshnessModels.js";

test("fresh required daily bars admit BUY", () => {
  const result = evaluateHistoricalDataFreshness({
    action: "BUY",
    requiredSymbols: ["AAA", "SPY"],
    barsBySymbol: {
      AAA: [{ bar_time: "2026-09-17T20:00:00Z" }],
      SPY: [{ bar_time: "2026-09-17T20:00:00Z" }],
    },
    policy: { max_daily_bar_age_hours: 120 },
    now: new Date("2026-09-18T08:00:00Z"),
  });

  assert.equal(result.approved, true);
  assert.deepEqual(result.metrics.stale_symbols, []);
});

test("stale candidate daily bars block BUY", () => {
  const result = evaluateHistoricalDataFreshness({
    action: "BUY",
    requiredSymbols: ["AAA", "SPY"],
    barsBySymbol: {
      AAA: [{ bar_time: "2026-09-10T20:00:00Z" }],
      SPY: [{ bar_time: "2026-09-17T20:00:00Z" }],
    },
    policy: { max_daily_bar_age_hours: 120 },
    now: new Date("2026-09-18T08:00:00Z"),
  });

  assert.equal(result.approved, false);
  assert.deepEqual(result.metrics.stale_symbols, ["AAA"]);
});

test("missing benchmark bars fail closed for BUY", () => {
  const result = evaluateHistoricalDataFreshness({
    action: "BUY",
    requiredSymbols: ["AAA", "SPY"],
    barsBySymbol: {
      AAA: [{ bar_time: "2026-09-17T20:00:00Z" }],
    },
    policy: { max_daily_bar_age_hours: 120 },
    now: new Date("2026-09-18T08:00:00Z"),
  });

  assert.equal(result.approved, false);
  assert.deepEqual(result.metrics.stale_symbols, ["SPY"]);
});

test("SELL de-risking remains available with stale historical bars", () => {
  const result = evaluateHistoricalDataFreshness({
    action: "SELL",
    requiredSymbols: ["AAA", "SPY"],
    barsBySymbol: {},
    policy: { max_daily_bar_age_hours: 24 },
    now: new Date("2026-09-18T08:00:00Z"),
  });

  assert.equal(result.approved, true);
  assert.equal(result.metrics.stale_symbols.length, 2);
});
