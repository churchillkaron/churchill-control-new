import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";

const executionSource = fs.readFileSync(
  new URL("../lib/platform/service-runtime/execution/ServiceExecutionRuntime.js", import.meta.url),
  "utf8",
);
const pricingSource = fs.readFileSync(
  new URL("../lib/platform/service-runtime/pricing/PricingRuntime.js", import.meta.url),
  "utf8",
);

test("service execution resolves reservation pricing with canonical quantity", () => {
  assert.match(
    executionSource,
    /const quantity = resolveExecutionQuantity\(\{[\s\S]*?unit: pricingRecord\?\.unit,[\s\S]*?\}\);/,
  );
  assert.match(
    executionSource,
    /PricingRuntime\.resolveRecord\(\{[\s\S]*?usage: \{ quantity \},[\s\S]*?\}\);/,
  );
});

test("per-second quantities derive from canonical media duration fields", () => {
  assert.match(executionSource, /normalizedUnit === "second"/);
  assert.match(executionSource, /payload\.duration_seconds/);
  assert.match(executionSource, /output\.duration_seconds/);
  assert.match(executionSource, /generationOutput\.duration_seconds/);
});

test("per-minute quantities can derive from seconds without treating seconds as minutes", () => {
  assert.match(executionSource, /normalizedUnit === "minute"/);
  assert.match(executionSource, /return seconds \? seconds \/ 60 : 1;/);
});

test("actual token settlement preserves execution quantity", () => {
  assert.match(
    executionSource,
    /const actualUsage = \{[\s\S]*?\.\.\.usage,[\s\S]*?quantity,[\s\S]*?actual: true,[\s\S]*?\};/,
  );
  assert.match(
    executionSource,
    /const settledPricing = await actualPricing\(\{[\s\S]*?quantity,[\s\S]*?\}\);/,
  );
});

test("per-unit supplier cost multiplies cost by quantity", () => {
  assert.match(
    pricingSource,
    /cost \+= finite\(pricing\.cost_per_unit\) \* quantity;/,
  );
});

test("pending settlement keeps the persisted usage quantity", () => {
  assert.match(
    executionSource,
    /const resolvedQuantityRaw = Number\(quantity \?\? usage\.quantity \?\? 1\);/,
  );
  assert.match(
    executionSource,
    /actualPricing\(\{[\s\S]*?pricing: reservationPricing,[\s\S]*?quantity: resolvedQuantity,[\s\S]*?\}\);/,
  );
});
