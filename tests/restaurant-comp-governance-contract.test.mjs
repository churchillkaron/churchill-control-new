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

test("restaurant COMP stays fail-closed until database readiness is proven", () => {
  assert.match(runtimeAdapter, /comp_ready:\s*false/);
  assert.match(
    correctionAdapter,
    /Restaurant item COMP lifecycle is not deployed in the database/
  );
  assert.doesNotMatch(runtimeAdapter, /comp_ready:\s*true/);
});
