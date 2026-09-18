import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const runtime = fs.readFileSync(
  new URL("../lib/markets/runtime/MarketPaperExecutionRuntime.js", import.meta.url),
  "utf8",
);
const migration = fs.readFileSync(
  new URL("../supabase/migrations/20260918155623_markets_limit_fill_price_protection.sql", import.meta.url),
  "utf8",
);

test("runtime passes order type and limit into simulated fill pricing", () => {
  assert.match(runtime, /orderType: order\.order_type/);
  assert.match(runtime, /limitPrice: order\.limit_price/);
});

test("database independently rejects non-marketable LIMIT execution", () => {
  assert.match(migration, /PAPER_LIMIT_PRICE_REQUIRED/);
  assert.match(migration, /PAPER_LIMIT_NOT_MARKETABLE/);
  assert.match(migration, /PAPER_ORDER_TYPE_UNSUPPORTED/);
});

test("database clamps adverse slippage to BUY and SELL limit prices", () => {
  assert.match(
    migration,
    /when v_side = 'BUY'[\s\S]*?least\(v_expected_fill_price, v_order\.limit_price\)/,
  );
  assert.match(
    migration,
    /greatest\(v_expected_fill_price, v_order\.limit_price\)/,
  );
});

test("database explicitly refuses a fill price beyond the order limit", () => {
  assert.match(migration, /PAPER_BUY_FILL_EXCEEDS_LIMIT_PRICE/);
  assert.match(migration, /PAPER_SELL_FILL_BELOW_LIMIT_PRICE/);
});

test("limit protection preserves exact quote and liquidity binding", () => {
  assert.match(migration, /PAPER_FILL_EXECUTION_CONTEXT_QUOTE_MISMATCH/);
  assert.match(migration, /PAPER_FILL_PRICE_NOT_BOUND_TO_LIVE_QUOTE/);
  assert.match(migration, /PAPER_FILL_EXCEEDS_DISPLAYED_LIQUIDITY_PARTICIPATION/);
});
