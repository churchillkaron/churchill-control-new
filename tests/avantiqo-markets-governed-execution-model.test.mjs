import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const migration = fs.readFileSync(
  new URL("../supabase/migrations/20260918163648_markets_governed_execution_model.sql", import.meta.url),
  "utf8",
);
const runtime = fs.readFileSync(
  new URL("../lib/markets/runtime/MarketPaperExecutionRuntime.js", import.meta.url),
  "utf8",
);
const route = fs.readFileSync(
  new URL("../app/api/markets/command-center/route.js", import.meta.url),
  "utf8",
);

test("governed PAPER order stores a versioned immutable execution model", () => {
  assert.match(migration, /'paper_execution_model'/);
  assert.match(migration, /'version', 1/);
  assert.match(migration, /'slippage_bps', 5/);
  assert.match(migration, /'fee_model', 'ZERO_COMMISSION'/);
  assert.match(migration, /'fee_amount', 0/);
  assert.match(migration, /'max_quote_participation', 0\.25/);
  assert.match(migration, /'quote_round_lot_size', 100/);
});

test("runtime fails closed when execution model is missing or malformed", () => {
  assert.match(runtime, /function governedPaperExecutionModel\(order\)/);
  assert.match(runtime, /PAPER_EXECUTION_MODEL_INVALID/);
  assert.match(runtime, /executionModel\.max_quote_participation/);
  assert.match(runtime, /executionModel\.quote_round_lot_size/);
  assert.match(runtime, /executionModel\.slippage_bps/);
  assert.match(runtime, /executionModel\.fee_amount/);
});

test("PROCESS_PAPER_ORDERS no longer accepts caller slippage or fee overrides", () => {
  const actionStart = route.indexOf('action === "PROCESS_PAPER_ORDERS"');
  const actionEnd = route.indexOf('return NextResponse.json({ success: false', actionStart);
  const block = route.slice(actionStart, actionEnd);
  assert.doesNotMatch(block, /body\.slippage_bps/);
  assert.doesNotMatch(block, /body\.fee_amount/);
});

test("database rejects fill parameters that differ from stored execution model", () => {
  assert.match(migration, /PAPER_FILL_SLIPPAGE_MODEL_MISMATCH/);
  assert.match(migration, /PAPER_FILL_FEE_MODEL_MISMATCH/);
  assert.match(migration, /PAPER_EXECUTION_MODEL_INVALID/);
  assert.match(migration, /v_model_slippage_bps \/ 10000\.0/);
  assert.match(migration, /v_quote_round_lots \* v_model_quote_round_lot_size/);
  assert.match(migration, /v_displayed_shares \* v_model_max_quote_participation/);
});

test("execution-model proof is sealed into fill quote binding evidence", () => {
  assert.match(migration, /'execution_model', v_execution_model/);
});

test("governed order creation and fill trigger remain non-public", () => {
  assert.match(
    migration,
    /revoke all on function public\.market_create_governed_paper_order[\s\S]*?from public, anon, authenticated/,
  );
  assert.match(
    migration,
    /revoke all on function public\.market_assert_paper_fill_quote_binding\(\)[\s\S]*?from public, anon, authenticated/,
  );
});
