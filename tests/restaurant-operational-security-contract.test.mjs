import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath = "supabase/migrations/20260906195600_restaurant_operational_data_api_lockdown.sql";
const policyPath = "lib/operations/commerce/security/POSActionPolicy.js";
const correctionPath = "lib/operations/commerce/adapters/shared/POSPaymentCorrectionAdapter.js";
const runtimePath = "lib/operations/commerce/adapters/restaurant/RestaurantPOSRuntimeAdapter.js";

test("restaurant operational tables are server-authoritative", async () => {
  const migration = await readFile(new URL(`../${migrationPath}`, import.meta.url), "utf8");
  const runtime = await readFile(new URL(`../${runtimePath}`, import.meta.url), "utf8");

  for (const table of ["orders", "order_items", "table_sessions", "restaurant_tables", "restaurant_zones", "kitchen_tickets", "bar_tickets", "payments", "restaurant_payment_allocations", "restaurant_table_merges", "pos_shifts", "pos_payment_corrections"]) {
    assert.match(migration, new RegExp(`'${table}'`));
  }
  assert.match(migration, /enable row level security/);
  assert.match(migration, /revoke all on table public\.%I from public, anon, authenticated/);
  assert.match(migration, /grant all on table public\.%I to service_role/);
  assert.match(runtime, /supabaseAdmin/);
  assert.doesNotMatch(migration, /'dishes'/);
  assert.doesNotMatch(migration, /'pos_discounts'/);
});

test("payment corrections use the central role policy without permission widening", async () => {
  const policy = await readFile(new URL(`../${policyPath}`, import.meta.url), "utf8");
  const correction = await readFile(new URL(`../${correctionPath}`, import.meta.url), "utf8");

  assert.match(policy, /const PAYMENT_CORRECTION_ROLES = new Set\(\[[\s\S]*"MANAGER"[\s\S]*"GENERAL_MANAGER"/);
  assert.match(policy, /PAYMENT_CORRECTION:\s*Object\.freeze\(\{[\s\S]*roles: PAYMENT_CORRECTION_ROLES,[\s\S]*permissions: Object\.freeze\(\[\]\),[\s\S]*fallback: false/);
  assert.match(correction, /canExecutePOSAction\(\{ access, action: "PAYMENT_CORRECTION" \}\)/);
  assert.doesNotMatch(correction, /const CORRECTION_ROLES/);
});
