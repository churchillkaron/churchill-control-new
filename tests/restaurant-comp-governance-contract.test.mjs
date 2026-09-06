import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const policy = fs.readFileSync(
  "lib/operations/commerce/security/POSActionPolicy.js",
  "utf8"
);
const runtimeRoute = fs.readFileSync(
  "app/api/pos/runtime/route.js",
  "utf8"
);
const runtimeAdapter = fs.readFileSync(
  "lib/operations/commerce/adapters/restaurant/RestaurantPOSRuntimeAdapter.js",
  "utf8"
);
const correctionAdapter = fs.readFileSync(
  "lib/operations/commerce/adapters/restaurant/RestaurantItemCorrectionAdapter.js",
  "utf8"
);
const settlement = fs.readFileSync(
  "lib/restaurant/payments/runtime/settleTablePayment.js",
  "utf8"
);
const orderQuery = fs.readFileSync(
  "lib/operations/commerce/adapters/restaurant/RestaurantOrderQueryAdapter.js",
  "utf8"
);
const receiptAdapter = fs.readFileSync(
  "lib/operations/commerce/adapters/restaurant/RestaurantReceiptAdapter.js",
  "utf8"
);
const orderControl = fs.readFileSync(
  "app/(system)/workspace/[organizationId]/operations/pos/orders/page.jsx",
  "utf8"
);
const migration = fs.readFileSync(
  "supabase/migrations/20260906183000_restaurant_order_item_void_lifecycle.sql",
  "utf8"
);

test("restaurant COMP is supervisor-governed and separately authorized", () => {
  assert.match(policy, /COMP_ORDER_ITEM/);
  assert.match(policy, /restaurant\.order\.comp/);
  assert.match(runtimeRoute, /comp_order_item:\s*can\("COMP_ORDER_ITEM"\)/);
});

test("restaurant COMP dispatches only to its dedicated atomic lifecycle", () => {
  assert.match(correctionAdapter, /COMP:[\s\S]*action:\s*"COMP_ORDER_ITEM"/);
  assert.match(correctionAdapter, /rpc:\s*"restaurant_comp_order_item_atomic"/);
  assert.match(correctionAdapter, /preserves_fulfillment_history:\s*config\.label === "COMP"/);
  assert.match(correctionAdapter, /unpaid_only:\s*true/);
});

test("restaurant COMP readiness requires both correction storage and the deployed RPC", () => {
  assert.match(runtimeAdapter, /restaurant_order_item_corrections/);
  assert.match(runtimeAdapter, /correctionRpcReady\("restaurant_comp_order_item_atomic"\)/);
  assert.match(runtimeAdapter, /comp_ready:\s*correctionCapabilities\.compReady/);
  assert.doesNotMatch(runtimeAdapter, /comp_ready:\s*true/);
});

test("atomic COMP preserves fulfillment state and removes only the billable charge", () => {
  assert.match(migration, /check \(upper\(correction_type\) in \('VOID','COMP'\)\)/);
  assert.match(migration, /create or replace function public\.restaurant_comp_order_item_atomic/);
  assert.match(migration, /security invoker/);
  assert.match(migration, /COMP requires persisted production or service evidence/);
  assert.match(migration, /preserves_fulfillment_history/);
  assert.match(migration, /RESTAURANT_ORDER_ITEM_COMPED/);
  assert.match(migration, /corrected_amount[\s\S]*0/);
});

test("COMP never mutates Kitchen or Expo fulfillment history", () => {
  assert.match(migration, /if v_correction_type = 'VOID' then[\s\S]*update public\.kitchen_tickets/);
  assert.match(migration, /if v_correction_type = 'VOID' then[\s\S]*update public\.bar_tickets/);
  assert.match(migration, /v_correction_type = 'COMP'[\s\S]*v_production_evidence/);
});

test("comped items cannot be selected for payment", () => {
  assert.match(settlement, /restaurant_order_item_corrections/);
  assert.match(settlement, /eq\("correction_type", "COMP"\)/);
  assert.match(settlement, /Comped restaurant items are non-billable and cannot be settled/);
});

test("Order Control and receipts retain COMP as visible non-billable audit evidence", () => {
  assert.match(orderQuery, /adjustment_type:\s*correctionType/);
  assert.match(orderQuery, /billable:\s*false/);
  assert.match(receiptAdapter, /correctionType !== "COMP"/);
  assert.match(receiptAdapter, /adjustment_type:\s*adjustmentType/);
  assert.match(orderControl, /data-restaurant-item-comp-action="true"/);
  assert.match(orderControl, /Comped · not charged/);
  assert.match(orderControl, /posRuntime\?\.capabilities\?\.comp_ready === true/);
});
