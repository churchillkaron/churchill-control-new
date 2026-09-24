import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const route = fs.readFileSync(new URL("../app/api/operator/turn/route.js", import.meta.url), "utf8");
const conversation = fs.readFileSync(new URL("../lib/operator/runtime/IntelligenceConversationRuntime.js", import.meta.url), "utf8");

test("Operator turn applies bounded working context before intelligence execution", () => {
  assert.match(route, /buildIntelligenceContextBudget/);
  assert.match(route, /conversation: boundedConversationContext/);
  assert.match(route, /longTermMemory: boundedLongTermMemory/);
  assert.match(route, /conversationAttachments: contextBudget\.attachments/);
});

test("context budget telemetry is exposed without changing authorization state", () => {
  assert.match(route, /OPERATOR_CONTEXT_BUDGET_V1/);
  assert.match(route, /context_budget:/);
  assert.match(route, /const agreementState = object\(memory\.agreementState\)/);
  assert.doesNotMatch(route, /agreementState:\s*contextBudget/);
});

test("persisted conversation loader has a hard server-side turn ceiling", () => {
  assert.match(conversation, /boundRecentConversationTurns/);
  assert.match(conversation, /\.limit\(24\)/);
});
