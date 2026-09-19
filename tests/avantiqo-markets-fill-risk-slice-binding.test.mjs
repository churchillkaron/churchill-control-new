import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const migration = fs.readFileSync(
  new URL("../supabase/migrations/20260918164656_markets_fill_risk_slice_binding.sql", import.meta.url),
  "utf8",
);

test("fill wrapper requires exact risk-slice evidence", () => {
  assert.match(migration, /PAPER_RISK_SLICE_EVIDENCE_REQUIRED/);
  assert.match(migration, /p_execution_quality->>'fill_quantity'/);
  assert.match(migration, /p_execution_quality->>'fill_price'/);
  assert.match(
    migration,
    /p_execution_quality #>> '\{risk_revalidation,execution_risk,order_notional\}'/,
  );
});

test("fill quantity must equal the quantity that passed risk", () => {
  assert.match(migration, /PAPER_FILL_QUANTITY_RISK_SLICE_MISMATCH/);
  assert.match(
    migration,
    /round\(v_evidence_fill_quantity, 8\) <> round\(p_fill_quantity, 8\)/,
  );
});

test("fill price and side must equal the risk-reviewed mutation", () => {
  assert.match(migration, /PAPER_FILL_PRICE_RISK_SLICE_MISMATCH/);
  assert.match(migration, /PAPER_FILL_SIDE_RISK_SLICE_MISMATCH/);
  assert.match(
    migration,
    /v_evidence_fill_side <> upper\(coalesce\(v_order\.side, ''\)\)/,
  );
});

test("fill notional must equal the exact quantity times exact fill price", () => {
  assert.match(migration, /PAPER_FILL_NOTIONAL_RISK_SLICE_MISMATCH/);
  assert.match(
    migration,
    /round\(p_fill_quantity \* p_fill_price, 8\)/,
  );
});

test("risk-slice binding executes before quote mutation and portfolio fill", () => {
  const sliceIndex = migration.indexOf("PAPER_FILL_QUANTITY_RISK_SLICE_MISMATCH");
  const quoteIndex = migration.indexOf("PAPER_EXECUTION_QUOTE_ALREADY_CONSUMED");
  const fillIndex = migration.indexOf("v_result := public.market_apply_paper_fill(");
  assert.ok(sliceIndex >= 0 && sliceIndex < quoteIndex);
  assert.ok(sliceIndex < fillIndex);
});

test("risk-bound wrapper remains service-role only", () => {
  assert.match(
    migration,
    /revoke all on function public\.market_apply_paper_fill_with_quality[\s\S]*?from public, anon, authenticated/,
  );
  assert.match(
    migration,
    /grant execute on function public\.market_apply_paper_fill_with_quality[\s\S]*?to service_role/,
  );
});
