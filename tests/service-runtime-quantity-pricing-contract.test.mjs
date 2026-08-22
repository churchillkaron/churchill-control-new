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

test("service execution resolves reservation pricing with requested quantity", () => {
  assert.match(
    executionSource,
    /const requestedQuantity = Number\(payload\.quantity \?\? input\.quantity \?\? 1\);/,
  );
  assert.match(
    executionSource,
    /PricingRuntime\.resolveRecord\(\{[\s\S]*?usage: \{ quantity \},[\s\S]*?\}\);/,
  );
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
