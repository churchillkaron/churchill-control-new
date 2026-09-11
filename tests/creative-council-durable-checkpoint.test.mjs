import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const workflow = fs.readFileSync(
  new URL("../lib/creative/director/runtime/CreativeWorkflowResolutionRuntime.js", import.meta.url),
  "utf8",
);

test("fresh workflow persists Council checkpoint before Tribunal", () => {
  const persistAt = workflow.indexOf("await persistCouncilCheckpoint(context, councilMaster)");
  const tribunalAt = workflow.indexOf("const master = await reviewWithDurableResume", persistAt);
  assert.ok(persistAt >= 0 && tribunalAt > persistAt);
});

test("resume can recover approved Council master from project metadata", () => {
  assert.match(workflow, /storedCouncilCheckpoint\(context\.project, context\)/);
  assert.match(workflow, /CREATIVE_APPROVED_COUNCIL_MASTER_REQUIRED/);
});
test("stored Council checkpoint is scope-bound", () => {
  assert.match(workflow, /state\.organization_id !== context\.organization_id/);
  assert.match(workflow, /state\.creative_project_id !== context\.creative_project_id/);
  assert.match(workflow, /state\.creative_mission_id !== context\.creative_mission_id/);
});

test("successful Tribunal clears Council and Tribunal checkpoints", () => {
  const wrapper = workflow.match(/async function reviewWithDurableResume[\s\S]*?\n}\n/)?.[0] || "";
  assert.match(wrapper, /await clearTribunalResume\(context\)/);
  assert.match(wrapper, /await clearCouncilCheckpoint\(context\)/);
});
