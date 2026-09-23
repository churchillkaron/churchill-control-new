import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../lib/platform/service-runtime/execution/ServiceExecutionRuntime.js", import.meta.url), "utf8");

test("owned local Code benchmark preview uses explicit zero-cost pricing without production routing", () => {
  assert.match(source, /localOwnedCodePreviewPricingRecord/);
  assert.match(source, /AvantiqoCodeLocalQueueProvider\.available/);
  assert.match(source, /execution_scope[\s\S]*BENCHMARK_REVIEW_PREVIEW/);
  assert.match(source, /input_cost_per_1m: 0/);
  assert.match(source, /output_cost_per_1m: 0/);
  assert.match(source, /supplier_billing_required: false/);
  assert.match(source, /provider_supplier_account_verification_required: false/);
  assert.match(source, /production_routing_allowed: false/);
  assert.match(source, /owned_local_development_preview: true/);
});
