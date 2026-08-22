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
    /PricingRuntime\.resolveRecord\(\{[\s\S]*?usage: \{ quantity, \.\.\.pricingDimensions \},[\s\S]*?\}\);/,
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

test("media quality and size are carried into reservation pricing", () => {
  assert.match(executionSource, /function resolvePricingDimensions\(payload = \{\}\)/);
  assert.match(executionSource, /const quality = first\(/);
  assert.match(executionSource, /const size = first\(/);
  assert.match(executionSource, /const pricingDimensions = resolvePricingDimensions\(payload\);/);
  assert.match(executionSource, /pricing_dimensions: pricingDimensions/);
});

test("actual token settlement preserves execution quantity and pricing dimensions", () => {
  assert.match(
    executionSource,
    /const actualUsage = \{[\s\S]*?\.\.\.usage,[\s\S]*?\.\.\.pricingDimensions,[\s\S]*?quantity,[\s\S]*?actual: true,[\s\S]*?\};/,
  );
  assert.match(
    executionSource,
    /const settledPricing = await actualPricing\(\{[\s\S]*?quantity,[\s\S]*?pricingDimensions,[\s\S]*?\}\);/,
  );
});

test("per-unit supplier cost multiplies resolved unit cost by quantity", () => {
  assert.match(
    pricingSource,
    /cost \+= unitPrice\.cost_per_unit \* quantity;/,
  );
});

test("dimensional pricing fails closed without an exact matrix entry", () => {
  assert.match(pricingSource, /DIMENSIONAL_UNIT_MATRIX/);
  assert.match(pricingSource, /unit_price_matrix/);
  assert.match(pricingSource, /PROVIDER_DIMENSIONAL_PRICE_REQUIRED/);
});

test("pending settlement keeps persisted quantity and pricing dimensions", () => {
  assert.match(
    executionSource,
    /const resolvedQuantityRaw = Number\(quantity \?\? usage\.quantity \?\? 1\);/,
  );
  assert.match(
    executionSource,
    /pricingDimensions: usage\.metadata\?\.pricing_dimensions \|\| \{\}/,
  );
});
