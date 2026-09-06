import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const queryAdapter = fs.readFileSync(
  "lib/operations/commerce/adapters/restaurant/RestaurantOrderQueryAdapter.js",
  "utf8"
);
const ordersPage = fs.readFileSync(
  "app/(system)/workspace/[organizationId]/operations/pos/orders/page.jsx",
  "utf8"
);

test("restaurant Order Control requires an active legal entity", () => {
  assert.match(queryAdapter, /Select an active legal entity before loading restaurant orders/);
  assert.match(queryAdapter, /\.eq\("entity_id", entityId\)/);
  assert.match(queryAdapter, /entity_id: entityId/);
});

test("restaurant Order Control forwards entity scope to the server", () => {
  assert.match(ordersPage, /entityId: String\(entityId\)/);
  assert.match(ordersPage, /if \(!organizationId \|\| !entityId \|\| orderRefreshRef\.current\) return/);
  assert.match(ordersPage, /Select an active legal entity before loading Order Control/);
});

test("restaurant Order Control preserves exact stationary POS table handoff", () => {
  assert.match(ordersPage, /new URLSearchParams\(\{ view: isRestaurant \? "sell" : "checkout" \}\)/);
  assert.match(ordersPage, /next\.set\("table", context\.reference \|\| context\.id\)/);
  assert.doesNotMatch(ordersPage, /isRestaurant \? "Open Payment"/);
});
