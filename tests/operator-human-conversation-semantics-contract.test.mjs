import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const understanding = fs.readFileSync(
  new URL("../lib/operator/runtime/OperatorHumanBusinessPartnerUnderstandingRuntime.js", import.meta.url),
  "utf8",
);
const conversation = fs.readFileSync(
  new URL("../lib/operator/runtime/OperatorFastConversationRuntime.js", import.meta.url),
  "utf8",
);

test("semantic understanding carries human-like conversational intent beyond routing", () => {
  assert.match(understanding, /conversation_mode/);
  assert.match(understanding, /context_depth/);
  assert.match(understanding, /response_detail/);
  assert.match(understanding, /continuity_required/);
  assert.match(understanding, /correction_or_revision/);
  assert.match(understanding, /Do not use literal keywords as the decision rule/);
});

test("fast conversation uses semantic conversation mode before legacy strategic pattern", () => {
  assert.match(conversation, /const semanticStrategic = Boolean/);
  assert.match(conversation, /const strategic = semanticUnderstanding \? semanticStrategic : fastStrategicDiscussion\(message\)/);
  assert.match(conversation, /semanticContextDepth === "expanded"/);
  assert.match(conversation, /semanticContinuity/);
  assert.match(conversation, /semanticCorrection/);
  assert.match(conversation, /const recentLimit = expandedContext \? 8 : 4/);
});

test("semantic correction and continuity shape the generated conversation", () => {
  assert.match(conversation, /Continue the existing thread naturally/);
  assert.match(conversation, /revising or correcting prior context/);
  assert.match(conversation, /semantic_conversation_mode/);
  assert.match(conversation, /semantic_correction_or_revision/);
});
