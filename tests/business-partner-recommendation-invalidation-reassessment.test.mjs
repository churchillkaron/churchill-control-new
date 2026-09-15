import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const fast = fs.readFileSync("lib/operator/runtime/OperatorFastConversationRuntime.js", "utf8");
const legacy = fs.readFileSync("lib/operator/runtime/OperatorTurnRuntimeLegacy.js", "utf8");

test("invalidated recommendation is exposed only as non-authoritative planning context", () => {
  assert.match(fast, /compactRecommendationInvalidationContext/);
  assert.match(fast, /old_action_disarmed:\s*true/);
  assert.match(fast, /authorization_effect:\s*"NONE"/);
  assert.match(fast, /The old action is disarmed and must never be revived or executed from this context/);
});

test("semantic continuation after invalidation forces current evidence planning", () => {
  assert.match(legacy, /semanticInvalidationReassessment/);
  assert.match(legacy, /semantic\.continuity_required === true/);
  assert.match(legacy, /semantic\.goal_relation === "continue"/);
  assert.match(legacy, /route:\s*"evidence"/);
  assert.match(legacy, /needs_current_evidence:\s*true/);
  assert.match(legacy, /requires_mutation:\s*false/);
});

test("reassessment can create a fresh recommendation without keyword dependence", () => {
  assert.match(legacy, /STRATEGIC_RECOMMENDATION_PATTERN\.test\(text\(options\.message\)\) \|\| invalidationReassessment/);
  assert.match(legacy, /delete cleanAgreement\.recommendation_invalidation/);
  assert.match(legacy, /agreementWithOperatorRecommendation/);
});

test("invalidation remains when reassessment cannot bind a safe new action", () => {
  const deletion = legacy.indexOf("delete cleanAgreement.recommendation_invalidation");
  const recommendationGuard = legacy.lastIndexOf("if (nextRecommendation)", deletion);
  assert.ok(recommendationGuard >= 0);
  assert.ok(deletion > recommendationGuard);
});

test("reassessment never directly grants execution", () => {
  assert.doesNotMatch(fast, /recommendation_invalidation_context[\s\S]{0,500}execution_authorized:\s*true/);
  assert.match(fast, /if you recommend a direction treat it as a new proposal requiring normal governance/);
});
