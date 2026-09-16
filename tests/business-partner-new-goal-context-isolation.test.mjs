import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../lib/operator/runtime/OperatorFastConversationRuntime.js", import.meta.url), "utf8");

test("semantic new goals isolate prior project and conversation context", () => {
  assert.match(source, /semanticGoalRelation === "new"/);
  assert.match(source, /const recent = semanticNewGoal\s*\? \[\]/);
  assert.match(source, /const projectContext = semanticNewGoal\s*\? null/);
  assert.match(source, /const pendingContext = semanticNewGoal \? null : compactPendingContext/);
  assert.match(source, /const invalidationContext = semanticNewGoal \? null : compactRecommendationInvalidationContext/);
});

test("new-goal evidence presentation cannot inherit the prior active objective", () => {
  assert.match(source, /!semanticNewGoal && text\(projectState\?\.objective\)/);
  assert.match(source, /semantic_new_goal_context_isolated: semanticNewGoal/);
});

test("project context is rendered only when context was actually admitted", () => {
  assert.match(source, /\$\{projectContext \? `Project context:/);
});
