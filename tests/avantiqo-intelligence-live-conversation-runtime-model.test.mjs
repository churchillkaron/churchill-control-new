import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const queue = fs.readFileSync(
  "lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceLocalQueueRuntime.js",
  "utf8",
);
const codePolicy = fs.readFileSync(
  "lib/platform/service-runtime/providers/avantiqo-intelligence/CodeIntelligencePolicyRuntime.js",
  "utf8",
);
const businessPolicy = fs.readFileSync(
  "lib/platform/service-runtime/providers/avantiqo-intelligence/BusinessPartnerIntelligencePolicyRuntime.js",
  "utf8",
);

test("Code live/deep model selection belongs to the Code policy, not shared queue transport", () => {
  assert.match(codePolicy, /code_live_conversation/);
  assert.match(codePolicy, /code_deep_conversation/);
  assert.match(codePolicy, /const LIVE_MODEL = "qwen3:1\.7b"/);
  assert.match(codePolicy, /const DEEP_MODEL = "qwen3:4b-instruct"/);
  assert.doesNotMatch(queue, /code_live_conversation|code_deep_conversation|CODE_AI/);
});

test("Business Partner owns its interactive and reasoning model policy independently", () => {
  assert.match(businessPolicy, /const PRODUCT = "business_partner"/);
  assert.match(businessPolicy, /"conversation_light"/);
  assert.match(businessPolicy, /"conversation"/);
  assert.match(businessPolicy, /"semantic_classifier"/);
  assert.match(businessPolicy, /runtime_model: live \? LIVE_MODEL : DEEP_MODEL/);
});

test("shared queue delegates model and product selection through the product policy dispatcher", () => {
  assert.match(queue, /resolveIntelligenceProductPolicy/);
  assert.match(queue, /const productPolicy = intelligenceProductPolicy\(input, executionLane\)/);
  assert.match(queue, /model: productPolicy\.runtime_model/);
  assert.match(queue, /intelligence_product: productPolicy\.product/);
  assert.match(queue, /intelligence_contract: productPolicy\.contract/);
});
