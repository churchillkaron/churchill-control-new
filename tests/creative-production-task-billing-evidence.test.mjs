import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

const RUNTIME = "lib/operations/tasks/runtime/ProductionTaskRuntime.js";

test("Creative provider polling requires persisted usage quantity and unit", async () => {
  const source = await fs.readFile(RUNTIME, "utf8");

  assert.match(source, /RUNNING_TASK_USAGE_QUANTITY_REQUIRED/);
  assert.match(source, /RUNNING_TASK_USAGE_UNIT_REQUIRED/);
  assert.match(source, /quantity:\s*usageQuantity/);
  assert.match(source, /unit:\s*usageUnit/);
  assert.doesNotMatch(source, /pending\.usage\.quantity\s*\|\|\s*1/);
  assert.doesNotMatch(source, /pending\.usage\.unit[\s\S]{0,100}["']request["']/);
});
