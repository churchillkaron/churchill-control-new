import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const createRoutePath = "app/api/pos/create/route.js";
const registryPath = "app/(system)/workspace/[organizationId]/operations/pos/POSApplicationSurfaceRegistry.jsx";
const runtimePath = "app/api/pos/runtime/route.js";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("POS order creation is server-authorized", async () => {
  const route = await source(createRoutePath);

  assert.match(route, /assertPOSActionAllowed/);
  assert.match(route, /action:\s*"ORDER_ENTRY"/);
  assert.match(route, /requireOrganizationAccess/);
  assert.match(route, /application\.adapter\.createOrder/);
});

test("restaurant stationary order entry consumes server capability truth", async () => {
  const registry = await source(registryPath);
  const runtime = await source(runtimePath);

  assert.match(runtime, /order_entry:\s*can\("ORDER_ENTRY"\)/);
  assert.match(registry, /canOrder = props\.posRuntime\?\.capabilities\?\.actions\?\.order_entry === true/);
  assert.match(registry, /\{canOrder \? \([\s\S]*<RestaurantStationaryOrderSurface/);
  assert.match(registry, /data-stationary-order-authority-boundary="true"/);
  assert.match(registry, /Service authority required/);
});

test("restaurant settlement authority remains independent of order entry", async () => {
  const registry = await source(registryPath);

  assert.match(registry, /canSettle = props\.posRuntime\?\.capabilities\?\.actions\?\.payment === true/);
  assert.match(registry, /data-stationary-payment-authority-boundary="true"/);
  assert.match(registry, /Cashier authority required/);
});
