import assert from "node:assert/strict";
import test from "node:test";
import { createIntelligenceToolRegistry } from "../lib/intelligence/runtime/IntelligenceToolRegistry.js";

function tool(index) {
  return {
    name: `tool_${index}`,
    description: `Tool ${index} `.repeat(80),
    parameters: { type: "object", properties: {}, additionalProperties: false },
    async execute() { return { ok: true }; },
  };
}

test("model-facing tool descriptors stay bounded as registry grows", () => {
  const registry = createIntelligenceToolRegistry(Array.from({ length: 100 }, (_, index) => tool(index)));
  const descriptors = registry.descriptors();
  const budget = registry.descriptorBudget();
  assert.equal(registry.size, 100);
  assert.ok(descriptors.length <= 24);
  assert.equal(budget.exposed_tools, descriptors.length);
  assert.equal(budget.available_tools, 100);
  assert.ok(budget.descriptor_chars <= 24000);
  assert.equal(budget.bounded, true);
});
