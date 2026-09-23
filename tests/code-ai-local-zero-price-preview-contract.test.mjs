import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../lib/platform/service-runtime/execution/ServiceExecutionRuntime.js", import.meta.url), "utf8");

test("owned local Code preview is zero-price only under the guarded development preview policy", () => {
  assert.match(source, /function localOwnedCodePreviewPricing/);
  assert.match(source, /provider \|\| ""\)\.trim\(\) === "avantiqo-code"/);
  assert.match(source, /capability \|\| ""\)\.trim\(\) === "ai\.code\.debug"/);
  assert.match(source, /pricing\?\.benchmark_review_preview === true/);
  assert.match(source, /policy\?\.local_owned_zero_price_preview === true/);
  assert.match(source, /customer_price: 0/);
  assert.match(source, /estimated: false/);
  assert.match(source, /production_routing_allowed: false/);
});
