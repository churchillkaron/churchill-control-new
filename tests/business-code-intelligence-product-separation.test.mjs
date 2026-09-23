import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const operatorFront = fs.readFileSync("lib/operator/runtime/OperatorFrontCognitionRuntime.js", "utf8");
const thesis = fs.readFileSync("lib/operator/runtime/OperatorBusinessThesisRuntime.js", "utf8");
const code = fs.readFileSync("lib/code/runtime/CodeAIConversationRuntime.js", "utf8");
const queue = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceLocalQueueRuntime.js", "utf8");
const dispatcher = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-intelligence/IntelligenceProductPolicyRuntime.js", "utf8");

test("Business Partner declares its product identity at front and thesis entry points", () => {
  assert.match(operatorFront, /intelligence_product: "business_partner"/);
  assert.match(thesis, /intelligence_product: "business_partner"/);
});

test("Code declares its product identity on every direct local text-generation request", () => {
  const requests = [...code.matchAll(/capability: "ai\.text\.generate"/g)].length;
  const productMarkers = [...code.matchAll(/intelligence_product: "code"/g)].length;
  assert.ok(requests > 0);
  assert.equal(productMarkers, requests);
});

test("shared queue contains no product-specific task names", () => {
  assert.doesNotMatch(queue, /code_live_conversation|code_deep_conversation|conversation_light|semantic_classifier|pending_action_/);
  assert.match(dispatcher, /resolveBusinessPartnerIntelligencePolicy/);
  assert.match(dispatcher, /resolveCodeIntelligencePolicy/);
});
