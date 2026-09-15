import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("assistant persistence emits bounded non-authoritative conversation learning signals", async () => {
  const route = await source("app/api/operator/turn/route.js");
  assert.match(route, /learningSignals = \{/);
  assert.match(route, /semantic_correction/);
  assert.match(route, /recommendation_rejected/);
  assert.match(route, /recommendation_selected/);
  assert.match(route, /clarification_required/);
  assert.match(route, /semantic_artifact_reuse/);
  assert.match(route, /response_detail_deep/);
  assert.match(route, /response_detail_brief/);
  assert.match(route, /context_expanded/);
  assert.match(route, /authorization_effect: "NONE"/);
});

test("conversation learning requires recurrence and remains advisory with expiry", async () => {
  const runtime = await source("lib/operator/runtime/AdaptiveConversationLearningRuntime.js");
  assert.match(runtime, /MIN_OCCURRENCES = 2/);
  assert.match(runtime, /LESSON_TTL_DAYS = 120/);
  assert.match(runtime, /min_occurrences: 5, min_conversations: 1/);
  assert.match(runtime, /repeated_semantic_conversation_signal/);
  assert.match(runtime, /advisory_only: true/);
  assert.match(runtime, /explicit_current_instruction_overrides: true/);
  assert.match(runtime, /authorization_value: "none"/);
  assert.match(runtime, /raw_user_text_persisted: false/);
  assert.match(runtime, /raw_assistant_text_persisted: false/);
  assert.match(runtime, /raw_reasoning_persisted: false/);
});

test("conversation learning is integrated beside verified execution learning", async () => {
  const conversation = await source("lib/operator/runtime/IntelligenceConversationRuntime.js");
  assert.match(conversation, /learnAdaptiveConversationLesson/);
  assert.match(conversation, /INTELLIGENCE_ADAPTIVE_CONVERSATION_LEARN_FAILED/);
  assert.match(conversation, /learnAdaptiveExecutionLesson/);
  assert.match(conversation, /retireAdaptiveLessonsAfterVerifiedSuccess/);
});

test("fast semantic correction survives into persisted evidence", async () => {
  const fast = await source("lib/operator/runtime/OperatorFastConversationRuntime.js");
  assert.match(fast, /semantic_correction_or_revision: semanticCorrection/);
});


test("adaptive conversation learning is visible to memory observability", async () => {
  const governor = await source("lib/operator/runtime/IntelligenceMemoryGovernorPolicy.js");
  assert.match(governor, /"adaptive_conversation_learning"/);
});
