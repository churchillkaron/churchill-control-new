import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const migration = fs.readFileSync(
  new URL("../supabase/migrations/20260918163109_markets_order_creation_expiry_bounds.sql", import.meta.url),
  "utf8",
);

test("governed order creation validates type TIF and future expiry", () => {
  assert.match(migration, /PAPER_ORDER_TYPE_INVALID/);
  assert.match(migration, /PAPER_ORDER_TIME_IN_FORCE_INVALID/);
  assert.match(migration, /PAPER_ORDER_EXPIRY_REQUIRED/);
  assert.match(migration, /PAPER_ORDER_EXPIRY_NOT_FUTURE/);
  assert.match(migration, /PAPER_LIMIT_PRICE_REQUIRED/);
});

test("order expiry cannot exceed governing decision authority", () => {
  assert.match(
    migration,
    /v_decision\.expires_at is not null and p_expires_at > v_decision\.expires_at/,
  );
  assert.match(migration, /PAPER_ORDER_EXPIRY_EXCEEDS_DECISION_AUTHORITY/);
});

test("expiry bounds are enforced while exact decision row is locked", () => {
  const lockIndex = migration.indexOf("from public.market_decisions");
  const boundIndex = migration.indexOf("PAPER_ORDER_EXPIRY_EXCEEDS_DECISION_AUTHORITY");
  const insertIndex = migration.indexOf("insert into public.market_paper_orders");
  assert.ok(lockIndex >= 0 && lockIndex < boundIndex);
  assert.ok(boundIndex < insertIndex);
});

test("order creation RPC remains service-role only", () => {
  assert.match(
    migration,
    /revoke all on function public\.market_create_governed_paper_order[\s\S]*?from public, anon, authenticated/,
  );
  assert.match(
    migration,
    /grant execute on function public\.market_create_governed_paper_order[\s\S]*?to service_role/,
  );
});
