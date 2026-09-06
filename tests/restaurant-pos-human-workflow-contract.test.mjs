import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const paths = Object.freeze({
  registry: "app/(system)/workspace/[organizationId]/operations/pos/POSApplicationSurfaceRegistry.jsx",
  checkout: "app/(system)/workspace/[organizationId]/operations/pos/POSInlineCheckout.jsx",
  waiter: "app/(system)/workspace/[organizationId]/operations/pos/RestaurantWaiterPhoneSurface.jsx",
  stationary: "app/(system)/workspace/[organizationId]/operations/pos/waiter/POS_FINAL_UI.jsx",
  floor: "app/(system)/workspace/[organizationId]/operations/tables/page.jsx",
  kitchen: "components/workspace/operations/RestaurantKitchenDisplay.jsx",
});

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("restaurant waiter phone stays service-only", async () => {
  const waiter = await source(paths.waiter);
  const registry = await source(paths.registry);

  assert.match(registry, /RestaurantWaiterPhoneSurface/);
  assert.match(registry, /requestedView === "waiter" \|\| requestedView === "service"/);
  assert.match(registry, /settlement stays at the stationary POS/);

  assert.doesNotMatch(waiter, /\/api\/pos\/payments\/settle/);
  assert.doesNotMatch(waiter, /operations\/pos\/payments/);
  assert.doesNotMatch(waiter, /goToPayment/);
});

test("restaurant stationary POS keeps ordering and settlement on one surface", async () => {
  const registry = await source(paths.registry);
  const stationary = await source(paths.stationary);

  assert.match(registry, /data-restaurant-stationary-pos="true"/);
  assert.match(registry, /<POSFinalUI[\s\S]*<POSInlineCheckout/);
  assert.match(registry, /payment: RestaurantSaleSurface/);
  assert.match(registry, /onActiveContextChange=\{setActiveTableReference\}/);
  assert.match(registry, /preferredContextReference=\{activeTableReference\}/);

  assert.match(stationary, /onActiveContextChange/);
  assert.match(stationary, /onActiveContextChange\?\.\(tableReference\(table\)\)/);
  assert.doesNotMatch(stationary, /Go to Payment/);
  assert.doesNotMatch(stationary, /operations\/pos\/payments/);
  assert.doesNotMatch(stationary, /goToPayment/);
});

test("floor handoff targets the stationary POS with exact table context", async () => {
  const floor = await source(paths.floor);
  const checkout = await source(paths.checkout);

  assert.match(floor, /view=stationary/);
  assert.match(floor, /table=\$\{encodeURIComponent\(/);
  assert.match(checkout, /preferredContextReference = null/);
  assert.match(checkout, /contextMatchesReference\(context, preferredContextReference\)/);
  assert.match(checkout, /requestedEntry\?\.context/);
});

test("restaurant kitchen display stays production-only", async () => {
  const kitchen = await source(paths.kitchen);

  assert.match(kitchen, /restaurant_kitchen_ticket/);
  assert.match(kitchen, /No payment, floor administration or serving controls/);
  assert.match(kitchen, /"PREPARING"/);
  assert.match(kitchen, /"READY"/);

  assert.doesNotMatch(kitchen, /\/api\/pos\/payments\/settle/);
  assert.doesNotMatch(kitchen, /operations\/pos\/payments/);
  assert.doesNotMatch(kitchen, />\s*Pay(?:ment)?\s*</i);
});
