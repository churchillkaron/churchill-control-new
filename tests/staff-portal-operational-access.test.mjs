import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const policy = fs.readFileSync(new URL("../lib/operations/commerce/security/RestaurantFulfillmentAccessPolicy.js", import.meta.url), "utf8");
const route = fs.readFileSync(new URL("../app/api/operations/fulfillment/route.js", import.meta.url), "utf8");
const adapter = fs.readFileSync(new URL("../lib/operations/commerce/adapters/restaurant/RestaurantFulfillmentAdapter.js", import.meta.url), "utf8");
const transition = fs.readFileSync(new URL("../lib/restaurant/operations/transitionRestaurantFulfillmentItem.js", import.meta.url), "utf8");

test("restaurant fulfillment separates kitchen and bar authority on the server", () => {
  assert.match(policy, /KITCHEN_ROLES/);
  assert.match(policy, /BAR_ROLES/);
  assert.match(policy, /restaurant_kitchen_ticket/);
  assert.match(policy, /restaurant_bar_ticket/);
  assert.match(route, /assertRestaurantFulfillmentAccess/);
  assert.match(route, /sourceType/);
  assert.match(route, /Fulfillment sourceType required/);
});

test("fulfillment queue does not query an unauthorized production source", () => {
  assert.match(adapter, /allowKitchen/);
  assert.match(adapter, /allowBar/);
  assert.match(adapter, /Promise\.resolve\(\{ data: \[\], error: null \}\)/);
  assert.match(adapter, /allowedSourceTypes/);
});

test("fulfillment uses effective organization roles and records completion evidence", () => {
  assert.match(route, /resolveStaffPortalEffectivePermissions/);
  assert.match(transition, /recordSystemEvent/);
  assert.match(transition, /RESTAURANT_WORK_ITEM_READY/);
});

const payableContexts = fs.readFileSync(new URL("../app/api/pos/payable-contexts/route.js", import.meta.url), "utf8");

test("POS payable contexts require the same payment authority as settlement", () => {
  assert.match(payableContexts, /assertPOSActionAllowed/);
  assert.match(payableContexts, /action: "PAYMENT"/);
});


test("legacy direct order-paid mutation is retired instead of bypassing canonical payment settlement", () => {
  const legacy = fs.readFileSync(new URL("../app/api/orders/update/route.js", import.meta.url), "utf8");
  assert.match(legacy, /LEGACY_ORDER_PAYMENT_MUTATION_RETIRED/);
  assert.match(legacy, /status: 410/);
  assert.doesNotMatch(legacy, /\.update\(\{[\s\S]*status:\s*["']paid["']/);
});
