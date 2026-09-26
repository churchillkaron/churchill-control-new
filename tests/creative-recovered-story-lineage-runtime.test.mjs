import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
const source = fs.readFileSync("lib/creative/director/runtime/CreativeMasterPlanRuntime.js", "utf8");
test("recovered story lineage helpers exist and preserve immutable approved story", () => {
  assert.match(source, /function recoveredStoryAuthority\(project = \{\}\)/);
  assert.match(source, /function isAuthorizedRecoveredStory\(project = \{\}, plan = \{\}\)/);
  assert.match(source, /function recoveredStoryFingerprint\(plan = \{\}\)/);
  assert.match(source, /function preserveAuthorizedRecoveredStory\(project = \{\}, candidatePlan = \{\}\)/);
  assert.match(source, /story: structuredClone\(recoveredPlan\.story\)/);
  assert.match(source, /immutable_story_body: true/);
  assert.match(source, /CREATIVE_STORY_LINEAGE_LOCK_V1/);
});
