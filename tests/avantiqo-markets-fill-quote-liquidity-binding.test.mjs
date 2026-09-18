import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const runtime = fs.readFileSync(
  new URL("../lib/markets/runtime/MarketPaperExecutionRuntime.js", import.meta.url),
  "utf8",
);
const migration = fs.readFileSync(
  new URL("../supabase/migrations/20260918154818_markets_fill_quote_liquidity_binding.sql", import.meta.url),
  "utf8",
);

test("PAPER execution price uses side-specific executable quote only", () => {
  assert.match(runtime, /if \(side === "BUY"\) return number\(snapshot\.ask_price\)/);
  assert.match(runtime, /if \(side === "SELL"\) return number\(snapshot\.bid_price\)/);
  assert.doesNotMatch(
    runtime,
    /function executableMarketPrice[\s\S]{0,500}latest_trade_price/,
  );
  assert.doesNotMatch(
    runtime,
    /function executableMarketPrice[\s\S]{0,500}minute_close/,
  );
});

test("database trigger independently binds every fill to live websocket quote", () => {
  assert.match(migration, /create or replace function public\.market_assert_paper_fill_quote_binding/);
  assert.match(migration, /before insert on public\.market_paper_fills/);
  assert.match(migration, /from public\.market_live_snapshots[\s\S]*?for share/);
  assert.match(migration, /PAPER_FILL_EXECUTION_SOURCE_UNSUPPORTED/);
  assert.match(migration, /PAPER_FILL_SIDE_QUOTE_PRICE_REQUIRED/);
});
test("fill price must equal side quote plus adverse slippage", () => {
  assert.match(migration, /v_reference_price \* \(1 \+ \(new\.slippage_bps \/ 10000\.0\)\)/);
  assert.match(migration, /v_reference_price \* \(1 - \(new\.slippage_bps \/ 10000\.0\)\)/);
  assert.match(migration, /PAPER_FILL_PRICE_NOT_BOUND_TO_LIVE_QUOTE/);
});

test("fill quantity cannot exceed 25 percent of displayed Alpaca round-lot liquidity", () => {
  assert.match(migration, /v_displayed_shares := v_quote_round_lots \* 100/);
  assert.match(migration, /v_max_fill_quantity := v_displayed_shares \* 0\.25/);
  assert.match(migration, /PAPER_FILL_EXCEEDS_DISPLAYED_LIQUIDITY_PARTICIPATION/);
});

test("fill evidence persists exact quote-binding proof", () => {
  assert.match(migration, /'quote_binding'/);
  assert.match(migration, /'quote_fingerprint'/);
  assert.match(migration, /'reference_price'/);
  assert.match(migration, /'displayed_shares'/);
  assert.match(migration, /'expected_fill_price'/);
});

test("quote-binding trigger function is not publicly executable", () => {
  assert.match(
    migration,
    /revoke all on function public\.market_assert_paper_fill_quote_binding\(\)[\s\S]*?from public, anon, authenticated/,
  );
});
