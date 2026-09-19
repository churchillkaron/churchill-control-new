import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const triggerMigration = fs.readFileSync(
  new URL("../supabase/migrations/20260918154818_markets_fill_quote_liquidity_binding.sql", import.meta.url),
  "utf8",
);
const contextMigration = fs.readFileSync(
  new URL("../supabase/migrations/20260918163648_markets_governed_execution_model.sql", import.meta.url),
  "utf8",
);
const latestWrapper = fs.readFileSync(
  new URL("../supabase/migrations/20260919031453_markets_automation_permission_fill_fence.sql", import.meta.url),
  "utf8",
);

test("paper fill table keeps before-insert execution context trigger", () => {
  assert.match(
    triggerMigration,
    /before insert on public\.market_paper_fills[\s\S]*?execute function public\.market_assert_paper_fill_quote_binding\(\)/,
  );
});

test("fill trigger requires transaction-local exact execution context", () => {
  assert.match(contextMigration, /current_setting\('app\.market_execution_snapshot_id', true\)/);
  assert.match(contextMigration, /current_setting\('app\.market_execution_order_id', true\)/);
  assert.match(contextMigration, /current_setting\('app\.market_execution_quote_fingerprint', true\)/);
  assert.match(contextMigration, /current_setting\('app\.market_execution_quote_at', true\)/);
  assert.match(contextMigration, /PAPER_FILL_EXECUTION_CONTEXT_REQUIRED/);
});

test("latest governed wrapper sets context only around lower fill mutation", () => {
  const setIndex = latestWrapper.indexOf("set_config('app.market_execution_snapshot_id'");
  const lowerFillIndex = latestWrapper.indexOf("v_result := public.market_apply_paper_fill(");
  const clearIndex = latestWrapper.indexOf("set_config('app.market_execution_snapshot_id', ''");
  assert.ok(setIndex >= 0);
  assert.ok(lowerFillIndex > setIndex);
  assert.ok(clearIndex > lowerFillIndex);
});

test("exact quote identity and order id are enforced by the fill trigger", () => {
  assert.match(contextMigration, /PAPER_FILL_EXECUTION_CONTEXT_ORDER_MISMATCH/);
  assert.match(contextMigration, /PAPER_FILL_EXECUTION_CONTEXT_QUOTE_MISMATCH/);
  assert.match(contextMigration, /PAPER_FILL_EXACT_LIVE_QUOTE_REQUIRED/);
});

test("lower fill remains unable to create a fill without guarded insert", () => {
  const lowerFill = fs.readFileSync(
    new URL("../supabase/migrations/20260918100842_avantiqo_markets_partial_fills_v1.sql", import.meta.url),
    "utf8",
  );
  assert.match(lowerFill, /insert into public\.market_paper_fills/);
  assert.match(triggerMigration, /before insert on public\.market_paper_fills/);
});
