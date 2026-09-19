import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const migration = fs.readFileSync(
  new URL("../supabase/migrations/20260918155217_markets_fill_exact_snapshot_context.sql", import.meta.url),
  "utf8",
);

test("fill trigger requires transaction-local exact execution context", () => {
  assert.match(migration, /current_setting\('app\.market_execution_snapshot_id', true\)/);
  assert.match(migration, /current_setting\('app\.market_execution_order_id', true\)/);
  assert.match(migration, /current_setting\('app\.market_execution_quote_fingerprint', true\)/);
  assert.match(migration, /current_setting\('app\.market_execution_quote_at', true\)/);
  assert.match(migration, /PAPER_FILL_EXECUTION_CONTEXT_REQUIRED/);
  assert.match(migration, /PAPER_FILL_EXECUTION_CONTEXT_ORDER_MISMATCH/);
});

test("trigger reads only the exact approved live snapshot id", () => {
  assert.match(
    migration,
    /from public\.market_live_snapshots[\s\S]*?where id = v_context_snapshot_id[\s\S]*?for share/,
  );
  assert.match(migration, /PAPER_FILL_EXACT_LIVE_QUOTE_REQUIRED/);
  assert.match(migration, /PAPER_FILL_EXECUTION_CONTEXT_QUOTE_MISMATCH/);
  assert.doesNotMatch(
    migration,
    /from public\.market_live_snapshots[\s\S]{0,350}order by latest_quote_at/,
  );
});

test("governed fill wrapper establishes context only immediately around atomic fill", () => {
  assert.match(
    migration,
    /set_config\('app\.market_execution_snapshot_id', p_snapshot_id::text, true\)[\s\S]*?market_apply_paper_fill\(/,
  );
  assert.match(
    migration,
    /set_config\('app\.market_execution_order_id', p_order_id::text, true\)/,
  );
  assert.match(
    migration,
    /set_config\('app\.market_execution_quote_fingerprint', v_quote_fingerprint, true\)/,
  );
  assert.match(
    migration,
    /market_apply_paper_fill\([\s\S]*?set_config\('app\.market_execution_snapshot_id', '', true\)/,
  );
});

test("exact snapshot remains bound to quote price and liquidity evidence", () => {
  assert.match(migration, /'snapshot_id', v_snapshot\.id/);
  assert.match(migration, /PAPER_FILL_PRICE_NOT_BOUND_TO_LIVE_QUOTE/);
  assert.match(migration, /PAPER_FILL_EXCEEDS_DISPLAYED_LIQUIDITY_PARTICIPATION/);
});

test("trigger and governed wrapper remain non-public mutations", () => {
  assert.match(
    migration,
    /revoke all on function public\.market_assert_paper_fill_quote_binding\(\)[\s\S]*?from public, anon, authenticated/,
  );
  assert.match(
    migration,
    /revoke all on function public\.market_apply_paper_fill_with_quality[\s\S]*?from public, anon, authenticated/,
  );
  assert.match(
    migration,
    /grant execute on function public\.market_apply_paper_fill_with_quality[\s\S]*?to service_role/,
  );
});
