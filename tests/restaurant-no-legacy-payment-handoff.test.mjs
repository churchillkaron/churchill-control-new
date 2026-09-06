import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import test from "node:test";

const registryPath = "app/(system)/workspace/[organizationId]/operations/pos/POSApplicationSurfaceRegistry.jsx";
const legacyPath = "app/(system)/workspace/[organizationId]/operations/pos/RestaurantStationaryPOSSurface.jsx";

test("restaurant stationary POS has no legacy separate-payment surface", async () => {
  await assert.rejects(access(new URL(`../${legacyPath}`, import.meta.url)));
  const registry = await readFile(new URL(`../${registryPath}`, import.meta.url), "utf8");
  assert.match(registry, /data-pos-unified-sale="true"/);
  assert.match(registry, /<RestaurantStationaryOrderSurface[\s\S]*<POSInlineCheckout/);
  assert.doesNotMatch(registry, /RestaurantStationaryPOSSurface/);
});
