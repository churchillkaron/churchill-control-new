import assert from "node:assert/strict";
import test from "node:test";

import { evaluateMarketMicrostructureRisk } from "../lib/markets/runtime/MarketMicrostructureRiskModels.js";

const now = new Date("2026-09-18T12:00:00Z");

test("fresh tight quote admits PAPER BUY", () => {
  const result = evaluateMarketMicrostructureRisk({
    policy: {
      max_market_data_age_seconds: 120,
      max_spread_bps: 50,
      min_quote_notional: 0,
    },
    snapshot: {
      captured_at: "2026-09-18T11:59:30Z",
      bid_price: 100,
      ask_price: 100.1,
      bid_size: 10,
      ask_size: 10,
    },
    side: "BUY",
    now,
  });
  assert.equal(result.approved, true);
  assert.ok(result.metrics.spread_bps < 50);
});

test("stale market state fails closed", () => {
  const result = evaluateMarketMicrostructureRisk({
    policy: {
      max_market_data_age_seconds: 60,
      max_spread_bps: 50,
      min_quote_notional: 0,
    },
    snapshot: {
      captured_at: "2026-09-18T11:50:00Z",
      bid_price: 100,
      ask_price: 100.1,
    },
    side: "BUY",
    now,
  });
  assert.equal(result.approved, false);
  assert.ok(result.reasons.some((reason) => reason.includes("stale")));
});

test("fresh trade or bar timestamp cannot hide a stale quote", () => {
  const result = evaluateMarketMicrostructureRisk({
    policy: {
      max_market_data_age_seconds: 60,
      max_spread_bps: 50,
      min_quote_notional: 0,
    },
    snapshot: {
      captured_at: "2026-09-18T11:59:59Z",
      latest_quote_at: "2026-09-18T11:50:00Z",
      bid_price: 100,
      ask_price: 100.1,
    },
    side: "BUY",
    now,
  });
  assert.equal(result.approved, false);
  assert.ok(result.reasons.some((reason) => reason.includes("stale")));
});

test("wide spread blocks new BUY exposure", () => {
  const result = evaluateMarketMicrostructureRisk({
    policy: {
      max_market_data_age_seconds: 120,
      max_spread_bps: 25,
      min_quote_notional: 0,
    },
    snapshot: {
      captured_at: "2026-09-18T11:59:30Z",
      bid_price: 100,
      ask_price: 101,
    },
    side: "BUY",
    now,
  });
  assert.equal(result.approved, false);
  assert.ok(result.reasons.some((reason) => reason.includes("spread")));
});

test("configured displayed-liquidity floor can block BUY", () => {
  const result = evaluateMarketMicrostructureRisk({
    policy: {
      max_market_data_age_seconds: 120,
      max_spread_bps: 50,
      min_quote_notional: 5000,
    },
    snapshot: {
      captured_at: "2026-09-18T11:59:30Z",
      bid_price: 100,
      ask_price: 100.1,
      ask_size: 10,
    },
    side: "BUY",
    now,
  });
  assert.equal(result.approved, false);
  assert.ok(result.reasons.some((reason) => reason.includes("liquidity")));
});

test("SELL de-risking does not require a bid-ask spread", () => {
  const result = evaluateMarketMicrostructureRisk({
    policy: {
      max_market_data_age_seconds: 120,
      max_spread_bps: 10,
      min_quote_notional: 100000,
    },
    snapshot: {
      captured_at: "2026-09-18T11:59:30Z",
      latest_trade_price: 100,
    },
    side: "SELL",
    now,
  });
  assert.equal(result.approved, true);
});
