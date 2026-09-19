import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const migration = fs.readFileSync(
  new URL("../supabase/migrations/20260918162442_markets_fill_lifecycle_expiry_fence.sql", import.meta.url),
  "utf8",
);

test("atomic fill locks and rechecks order lifecycle", () => {
  assert.match(
    migration,
    /from public\.market_paper_orders[\s\S]*?for update[\s\S]*?PAPER_ORDER_NOT_FILLABLE/,
  );
  assert.match(migration, /PAPER_ORDER_TIME_IN_FORCE_INVALID/);
  assert.match(migration, /v_order\.expires_at is not null and v_order\.expires_at <= now\(\)/);
  assert.match(migration, /PAPER_ORDER_TIF_EXPIRED_AT_FILL/);
});

test("atomic fill independently rechecks governed decision expiry", () => {
  assert.match(
    migration,
    /from public\.market_decisions[\s\S]*?for update[\s\S]*?PAPER_DECISION_NOT_APPROVED/,
  );
  assert.match(migration, /v_decision\.expires_at is not null and v_decision\.expires_at <= now\(\)/);
  assert.match(migration, /PAPER_DECISION_EXPIRED_AT_FILL/);
});

test("lifecycle expiry fence executes before portfolio mutation", () => {
  const orderExpiryIndex = migration.indexOf("PAPER_ORDER_TIF_EXPIRED_AT_FILL");
  const decisionExpiryIndex = migration.indexOf("PAPER_DECISION_EXPIRED_AT_FILL");
  const applyFillIndex = migration.indexOf("v_result := public.market_apply_paper_fill(");
  assert.ok(orderExpiryIndex >= 0 && orderExpiryIndex < applyFillIndex);
  assert.ok(decisionExpiryIndex >= 0 && decisionExpiryIndex < applyFillIndex);
});

test("governed fill wrapper remains service-role only", () => {
  assert.match(
    migration,
    /revoke all on function public\.market_apply_paper_fill_with_quality[\s\S]*?from public, anon, authenticated/,
  );
  assert.match(
    migration,
    /grant execute on function public\.market_apply_paper_fill_with_quality[\s\S]*?to service_role/,
  );
});
