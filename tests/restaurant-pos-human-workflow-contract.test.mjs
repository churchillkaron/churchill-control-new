import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const paths = Object.freeze({
  registry: "app/(system)/workspace/[organizationId]/operations/pos/POSApplicationSurfaceRegistry.jsx",
  checkout: "app/(system)/workspace/[organizationId]/operations/pos/POSInlineCheckout.jsx",
  waiter: "app/(system)/workspace/[organizationId]/operations/pos/RestaurantWaiterPhoneSurface.jsx",
  stationary: "app/(system)/workspace/[organizationId]/operations/pos/RestaurantStationaryOrderSurface.jsx",
  floor: "app/(system)/workspace/[organizationId]/operations/tables/page.jsx",
  kitchen: "components/workspace/operations/RestaurantKitchenDisplay.jsx",
  expo: "components/workspace/operations/RestaurantExpoPass.jsx",
  expoPage: "app/(system)/workspace/[organizationId]/operations/expo/page.jsx",
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

test("restaurant stationary POS is a dedicated desktop workstation", async () => {
  const registry = await source(paths.registry);
  const stationary = await source(paths.stationary);

  assert.match(registry, /data-restaurant-stationary-pos="true"/);
  assert.match(registry, /RestaurantStationaryOrderSurface/);
  assert.match(registry, /<RestaurantStationaryOrderSurface[\s\S]*<POSInlineCheckout/);
  assert.match(registry, /payment: RestaurantSaleSurface/);
  assert.match(registry, /onActiveContextChange=\{setActiveTableReference\}/);
  assert.match(registry, /preferredContextReference=\{activeTableReference\}/);

  assert.match(stationary, /data-restaurant-stationary-order-surface="true"/);
  assert.match(stationary, /data-stationary-draft-order="true"/);
  assert.match(stationary, /Search menu/);
  assert.match(stationary, /Send to kitchen/);
  assert.match(stationary, /Change guest count/);
  assert.match(stationary, /Move whole table/);
  assert.match(stationary, /Merge tables/);
  assert.doesNotMatch(stationary, /Go to Payment/);
  assert.doesNotMatch(stationary, /operations\/pos\/payments/);
  assert.doesNotMatch(stationary, /goToPayment/);
  assert.doesNotMatch(stationary, /onMouseDown=\{\(\) => startHold/);
});

test("stationary checkout uses real split tenders and cash change", async () => {
  const checkout = await source(paths.checkout);

  assert.match(checkout, /data-stationary-payment-rail="true"/);
  assert.match(checkout, /Split tender/);
  assert.match(checkout, /Take one real tender at a time until remaining reaches zero/);
  assert.match(checkout, /data-cash-change-workflow="true"/);
  assert.match(checkout, /Cash received/);
  assert.match(checkout, /Change/);
  assert.match(checkout, /tenderedAmount/);
  assert.match(checkout, /paidAmount/);
  assert.match(checkout, /numericAmount > remainingBalance \+ 0\.01/);
  assert.doesNotMatch(checkout, /value:\s*"MIXED"/);
});

test("floor handoff targets the stationary POS with exact table context", async () => {
  const floor = await source(paths.floor);
  const checkout = await source(paths.checkout);
  const stationary = await source(paths.stationary);

  assert.match(floor, /new URLSearchParams\(\{[\s\S]*view: "stationary",[\s\S]*table: String\(tableReference\)/);
  assert.match(floor, /router\.push\(`\/workspace\/\$\{organizationId\}\/operations\/pos\?\$\{query\.toString\(\)\}`\)/);
  assert.match(checkout, /preferredContextReference = null/);
  assert.match(checkout, /contextMatchesReference\(context, preferredContextReference\)/);
  assert.match(checkout, /requestedEntry\?\.context/);
  assert.match(stationary, /preferredTableReference = null/);
  assert.match(stationary, /matchesTableReference\(table, preferred\)/);
});

test("restaurant floor stays a live overview, not a second POS", async () => {
  const floor = await source(paths.floor);

  assert.match(floor, /Restaurant Floor/);
  assert.match(floor, /Continue at stationary POS/);
  assert.match(floor, /Service detail/);
  assert.doesNotMatch(floor, /\/api\/pos\/payments\/settle/);
  assert.doesNotMatch(floor, /Send to kitchen/);
});

test("restaurant kitchen display stays production-only", async () => {
  const kitchen = await source(paths.kitchen);

  assert.match(kitchen, /restaurant_kitchen_ticket/);
  assert.match(kitchen, /No payment, floor administration or serving controls/);
  assert.match(kitchen, /"PREPARING"/);
  assert.match(kitchen, /"READY"/);

  assert.doesNotMatch(kitchen, /\/api\/pos\/payments\/settle/);
  assert.doesNotMatch(kitchen, /operations\/pos\/payments/);
  assert.doesNotMatch(kitchen, /status:\s*"SERVED"/);
  assert.doesNotMatch(kitchen, />\s*Pay(?:ment)?\s*</i);
});

test("restaurant expo owns ready-to-served physical handoff", async () => {
  const expo = await source(paths.expo);
  const expoPage = await source(paths.expoPage);

  assert.match(expoPage, /RestaurantExpoPass/);
  assert.match(expo, /scope:\s*"ready"/);
  assert.match(expo, /restaurant_kitchen_ticket/);
  assert.match(expo, /restaurant_bar_ticket/);
  assert.match(expo, /status:\s*"SERVED"/);
  assert.match(expo, /Only ready kitchen and bar items appear here/);
  assert.doesNotMatch(expo, /\/api\/pos\/payments\/settle/);
});
