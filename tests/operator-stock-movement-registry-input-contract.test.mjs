import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const registry = readFileSync("lib/platform/registry/erpRegistry.base.js", "utf8");
const movement = readFileSync("lib/inventory/movements/createInventoryMovement.js", "utf8");

test("stock movement registry exposes the material create inputs supported by inventory runtime", () => {
  const start = registry.indexOf('id: "stock_movements"');
  assert.ok(start >= 0);
  const block = registry.slice(start, start + 3200);
  for (const field of [
    "item_id",
    "movement_type",
    "quantity",
    "unit_cost",
    "reference_id",
    "post_to_finance",
  ]) {
    assert.match(block, new RegExp(`\\b${field}\\b`));
  }
  assert.match(block, /required:\s*\["item_id",\s*"movement_type",\s*"quantity"\]/);
  assert.match(block, /additionalProperties:\s*false/);

  assert.match(movement, /referenceId\s*=\s*null/);
  assert.match(movement, /postToFinance\s*=\s*false/);
  assert.match(movement, /reference_id:\s*referenceId/);
  assert.match(movement, /if \(postToFinance && totalCost > 0\)/);
});
