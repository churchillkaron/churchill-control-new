import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const route = fs.readFileSync(
  new URL("../app/api/operator/turn/route.js", import.meta.url),
  "utf8",
);

test("continuity recovery and current-project memory recall run in parallel", () => {
  assert.match(route, /const continuityPromise = recoverCrossConversationProject/);
  assert.match(route, /const currentProjectMemoryPromise = recallIntelligenceMemory/);
  assert.match(route, /const \[continuity, currentProjectMemory\] = await Promise\.all/);
});

test("recovered projects re-read memory against recovered project state", () => {
  assert.match(route, /if \(continuity\.recovered === true\)/);
  assert.match(route, /projectState: effectiveProjectState/);
  assert.match(route, /long_term_memory_reread_after_recovery/);
});

test("assistant persistence and durable project learning share the response critical path", () => {
  assert.match(route, /const assistantPersistPromise = persistAssistantTurnAndConversationState/);
  assert.match(route, /const longTermLearnPromise = learnProjectStateMemories/);
  assert.match(route, /const \[persisted\] = await Promise\.all\(\[\s*assistantPersistPromise,\s*longTermLearnPromise/);
});


test("continuity recovery is scoped to the current conversation for pending selection", () => {
  assert.match(route, /currentConversationId:\s*memory\.conversation\.id/);
});
