import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const paths = Object.freeze({
  policy: "lib/operations/commerce/security/POSActionPolicy.js",
  runtime: "app/api/pos/runtime/route.js",
  adapter: "lib/operations/commerce/adapters/restaurant/RestaurantItemCorrectionAdapter.js",
  restaurantAdapter: "lib/operations/commerce/adapters/restaurant/RestaurantPOSAdapter.js",
  route: "app/api/pos/item-corrections/route.js",
  worker: "lib/workers/work-centers/processWorkCenterEvents.js",
  migration: "supabase/migrations/20260906183000_restaurant_order_item_void_lifecycle.sql",
});

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("restaurant item VOID is supervisor-governed and exposed by the server runtime", async () => {
  const policy = await source(paths.policy);
  const runtime = await source(paths.runtime);

  assert.match(policy, /VOID_ORDER_ITEM:\s*Object\.freeze\(\{/);
  assert.match(policy, /VOID_ORDER_ITEM:[\s\S]*roles:\s*SUPERVISOR_ROLES/);
  assert.match(policy, /restaurant\.order\.void/);
  assert.match(policy, /VOID_ORDER_ITEM:[\s\S]*fallback:\s*false/);
  assert.match(runtime, /void_order_item:\s*can\("VOID_ORDER_ITEM"\)/);
});

test("restaurant item corrections are adapter-owned and fail closed until the atomic RPC exists", async () => {
  const adapter = await source(paths.adapter);
  const restaurantAdapter = await source(paths.restaurantAdapter);
  const route = await source(paths.route);

  assert.match(restaurantAdapter, /RestaurantItemCorrectionAdapter/);
  assert.match(restaurantAdapter, /itemCorrections:\s*RestaurantItemCorrectionAdapter/);
  assert.match(route, /resolved\.application\.adapter\?\.itemCorrections/);
  assert.match(route, /itemCorrections\.execute/);
  assert.match(adapter, /assertPOSActionAllowed\(\{ access, action: "VOID_ORDER_ITEM" \}\)/);
  assert.match(adapter, /correctionType !== "VOID"/);
  assert.match(adapter, /Only VOID is governed for restaurant items at this stage/);
  assert.match(adapter, /Void reason required/);
  assert.match(adapter, /restaurant_void_order_item_atomic/);
  assert.match(adapter, /Restaurant item VOID lifecycle is not deployed in the database/);
  assert.match(adapter, /pre_production_only:\s*true/);
  assert.match(adapter, /unpaid_only:\s*true/);
  assert.match(adapter, /preserves_original_item:\s*true/);
  assert.match(adapter, /comp_enabled:\s*false/);
  assert.match(adapter, /discount_enabled:\s*false/);
});

test("restaurant VOID migration preserves history and blocks unsafe financial or production mutation", async () => {
  const migration = await source(paths.migration);

  assert.match(migration, /create table if not exists public\.restaurant_order_item_corrections/);
  assert.match(migration, /alter table public\.restaurant_order_item_corrections enable row level security/);
  assert.match(migration, /revoke all on table public\.restaurant_order_item_corrections from public, anon, authenticated/);
  assert.match(migration, /security definer/);
  assert.match(migration, /revoke all on function public\.restaurant_void_order_item_atomic/);
  assert.match(migration, /Supervisor or owner role required for restaurant item VOID/);
  assert.match(migration, /Paid or partially paid orders must use the payment correction or refund lifecycle/);
  assert.match(migration, /Only an unstarted restaurant item can be voided/);
  assert.match(migration, /Kitchen or bar production already started/);
  assert.match(migration, /Current financial policy no longer matches this order/);
  assert.match(migration, /set status = 'VOID',[\s\S]*void_reason =/);
  assert.doesNotMatch(migration, /delete\s+from\s+public\.order_items/i);
  assert.match(migration, /public\.kitchen_tickets/);
  assert.match(migration, /public\.bar_tickets/);
  assert.match(migration, /RESTAURANT_ORDER_ITEM_VOIDED/);
  assert.match(migration, /v_session_revenue/);
});

test("delayed order events never redispatch terminal restaurant items", async () => {
  const worker = await source(paths.worker);

  assert.match(worker, /TERMINAL_ORDER_ITEM_STATUSES/);
  assert.match(worker, /"VOID"/);
  assert.match(worker, /"VOIDED"/);
  assert.match(worker, /"CANCELLED"/);
  assert.match(worker, /const dispatchableItems = \(items \|\| \[\]\)\.filter/);
  assert.match(worker, /for \(const item of dispatchableItems\)/);
  assert.doesNotMatch(worker, /for \(const item of items\) \{[\s\S]{0,180}resolveWorkCenter/);
});
