import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
const source = fs.readFileSync("lib/creative/director/runtime/CreativeMasterPlanRuntime.js", "utf8");
test("recovered story authority is applied before validation in fresh and settled master paths", () => {
  const matches = source.match(/let plan = preserveAuthorizedRecoveredStory\(/g) || [];
  assert.ok(matches.length >= 2, `expected recovered-story lock in fresh and settled paths; found ${matches.length}`);
  assert.match(source, /repairExistingPlan\([\s\S]*let plan = preserveAuthorizedRecoveredStory\(/);
  assert.match(source, /const missionBoundPlan = applySemanticMissionContract[\s\S]*let plan = preserveAuthorizedRecoveredStory\(/);
});
