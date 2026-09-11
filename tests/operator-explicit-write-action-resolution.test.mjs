import assert from "node:assert/strict";
import { register } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

register("../scripts/next-alias-loader.mjs", import.meta.url);
const { resolveExplicitWriteActionRequest, fastVoiceFallbackReason } = await import(
  "../lib/operator/runtime/OperatorReasoningRuntime.js"
);

const stock = {
  key: "supply_chain.stock_movements.create",
  domain: "supply_chain",
  capability: "stock_movements",
  action: "create",
  mode: "write",
  name: null,
  description: "Create + Movement in supply-chain.",
  operator_aliases: ["create movement", "create a movement", "make movement"],
  tags: ["supply_chain", "stock_movements", "registry", "write"],
  input_schema: { type: "object", properties: {}, additionalProperties: true },
};
const item = {
  key: "supply_chain.items.create",
  domain: "supply_chain",
  capability: "items",
  action: "create",
  mode: "write",
  name: "Create Item",
  operator_aliases: ["create item"],
  input_schema: { type: "object", required: ["name"] },
};

test("payload-heavy explicit create resolves from its leading action clause", () => {
  const result = resolveExplicitWriteActionRequest({
    message: "Create one stock movement for certification. Entity ID 11111111-1111-4111-8111-111111111111. Item ID 22222222-2222-4222-8222-222222222222. Movement type ADJUSTMENT_IN. Quantity 1.",
    capabilities: [stock, item],
  });
  assert.equal(result?.capability?.key, stock.key);
  assert.ok(result.separation >= 0.12);
});

test("polite action request resolves but informational questions do not", () => {
  assert.equal(resolveExplicitWriteActionRequest({ message: "Please create a stock movement", capabilities: [stock, item] })?.capability?.key, stock.key);
  assert.equal(resolveExplicitWriteActionRequest({ message: "Can you create a stock movement", capabilities: [stock, item] })?.capability?.key, stock.key);
  assert.equal(resolveExplicitWriteActionRequest({ message: "How do I create a stock movement?", capabilities: [stock, item] }), null);
  assert.equal(resolveExplicitWriteActionRequest({ message: "What is a stock movement?", capabilities: [stock, item] }), null);
});


test("fast shortlist cannot hide a strong full-catalog write action", () => {
  const parsed = {
    response_text: "Creating stock movement with the supplied details",
    intent: "answer",
    confidence: 0.99,
    clarification: { required: false, question: null, options: [] },
    execution: { capability_key: null, payload: {}, reason: null },
  };
  const fastRequest = {
    user_input: { message: "Create one stock movement for certification. Quantity 1." },
    executable_capabilities: [item],
  };
  assert.equal(
    fastVoiceFallbackReason(parsed, fastRequest, [stock, item]),
    "explicit_write_action_requires_deep",
  );
});
