import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath = "supabase/migrations/20260906195600_restaurant_operational_data_api_lockdown.sql";
const policyPath = "lib/operations/commerce/security/POSActionPolicy.js";
const correctionPath = "lib/operations/commerce/adapters/shared/POSPaymentCorrectionAdapter.js";
const runtimePath = "lib/operations/commerce/adapters/restaurant/RestaurantPOSRuntimeAdapter.js";
const runtimeRoutePath = "app/api/pos/runtime/route.js";
const surfaceRegistryPath = "app/(system)/workspace/[organizationId]/operations/pos/POSApplicationSurfaceRegistry.jsx";
const ordersPath = "app/(system)/workspace/[organizationId]/operations/pos/orders/page.jsx";

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

test("payment corrections use the exact central role policy used by the database", async () => {
  const policy = await readFile(new URL(`../${policyPath}`, import.meta.url), "utf8");
  const correction = await readFile(new URL(`../${correctionPath}`, import.meta.url), "utf8");
  const correctionRoles = policy.match(/const PAYMENT_CORRECTION_ROLES = new Set\(\[([\s\S]*?)\]\);/)?.[1] || "";

  for (const role of ["MANAGER", "GENERAL_MANAGER", "OWNER", "ORGANIZATION_OWNER", "ORG_OWNER", "PLATFORM_OWNER", "SUPER_ADMIN"]) {
    assert.match(correctionRoles, new RegExp(`"${role}"`));
  }
  assert.doesNotMatch(correctionRoles, /"ADMIN"/);
  assert.doesNotMatch(correctionRoles, /"SUPERVISOR"|"SHIFT_MANAGER"|"DUTY_MANAGER"/);
  assert.match(policy, /PAYMENT_CORRECTION:\s*Object\.freeze\(\{[\s\S]*roles: PAYMENT_CORRECTION_ROLES,[\s\S]*permissions: Object\.freeze\(\[\]\),[\s\S]*exact_roles: true,[\s\S]*fallback: false/);
  assert.match(policy, /if \(!policy\.exact_roles && FULL_ACCESS_ROLES\.has\(snapshot\.role\)\) return true/);
  assert.match(correction, /canExecutePOSAction\(\{ access, action: "PAYMENT_CORRECTION" \}\)/);
  assert.match(correction, /requireCorrectionAuthority\(actor\);[\s\S]*const scope = resolveScope/);
  assert.doesNotMatch(correction, /const CORRECTION_ROLES/);
});

test("payment correction data and UI are hidden unless exact correction authority is present", async () => {
  const runtimeRoute = await readFile(new URL(`../${runtimeRoutePath}`, import.meta.url), "utf8");
  const registry = await readFile(new URL(`../${surfaceRegistryPath}`, import.meta.url), "utf8");

  assert.match(runtimeRoute, /payment_correction: can\("PAYMENT_CORRECTION"\)/);
  assert.match(registry, /const canCorrectPayment = actions\.payment_correction === true/);
  assert.match(registry, /\{canCorrectPayment \? \([\s\S]*<RestaurantPaymentCorrections/);
});

test("restaurant item void remains hidden until both authority and database readiness exist", async () => {
  const runtime = await readFile(new URL(`../${runtimePath}`, import.meta.url), "utf8");
  const orders = await readFile(new URL(`../${ordersPath}`, import.meta.url), "utf8");

  assert.match(runtime, /from\("restaurant_order_item_corrections"\)/);
  assert.match(runtime, /item_corrections_ready: itemCorrectionsReady/);
  assert.match(orders, /capabilities\?\.actions\?\.void_order_item === true/);
  assert.match(orders, /capabilities\?\.item_corrections_ready === true/);
  assert.match(orders, /PRE_PRODUCTION_STATUSES = new Set\(\["NEW", "PENDING"\]\)/);
  assert.match(orders, /fetch\("\/api\/pos\/item-corrections"/);
  assert.match(orders, /correctionType: "VOID"/);
  assert.match(orders, /reason: voidReason\.trim\(\)/);
  assert.match(orders, /data-restaurant-item-void-action="true"/);
});

test("restaurant order control returns to unified stationary POS instead of a separate payment view", async () => {
  const orders = await readFile(new URL(`../${ordersPath}`, import.meta.url), "utf8");

  assert.match(orders, /new URLSearchParams\(\{ view: isRestaurant \? "sell" : "checkout" \}\)/);
  assert.match(orders, /isRestaurant \? "Open stationary POS" : "Open Payment"/);
  assert.match(orders, /data-restaurant-open-stationary-pos/);
});

test("unimplemented advanced restaurant corrections are explicit fail-closed capabilities", async () => {
  const runtime = await readFile(new URL(`../${runtimePath}`, import.meta.url), "utf8");

  assert.match(runtime, /comp_ready: false/);
  assert.match(runtime, /discounts_ready: false/);
  assert.match(runtime, /non_cash_refunds_ready: false/);
});
