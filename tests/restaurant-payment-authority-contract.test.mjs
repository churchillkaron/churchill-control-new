import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const settlementPath = "lib/restaurant/payments/runtime/settleTablePayment.js";
const policyPath = "lib/operations/commerce/security/POSActionPolicy.js";
const registryPath = "app/(system)/workspace/[organizationId]/operations/pos/POSApplicationSurfaceRegistry.jsx";

test("restaurant settlement is cashier-authorized on server and UI", async () => {
  const settlement = await readFile(new URL(`../${settlementPath}`, import.meta.url), "utf8");
  const policy = await readFile(new URL(`../${policyPath}`, import.meta.url), "utf8");
  const registry = await readFile(new URL(`../${registryPath}`, import.meta.url), "utf8");

  assert.match(policy, /PAYMENT:\s*Object\.freeze/);
  assert.match(policy, /fallback:\s*false/);
  assert.match(settlement, /assertPOSActionAllowed/);
  assert.match(settlement, /action:\s*"PAYMENT"/);
  assert.match(registry, /capabilities\?\.actions\?\.payment === true/);
  assert.match(registry, /data-stationary-payment-authority-boundary="true"/);
  assert.match(registry, /Cashier authority required/);
});
