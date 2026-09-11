import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(
  new URL("../lib/creative/director/runtime/CreativeWorkflowResolutionRuntime.js", import.meta.url),
  "utf8",
);

test("post-repair master checkpoint is durable and scope-bound", () => {
  assert.match(source, /creative_post_repair_master_checkpoint/);
  assert.match(source, /CREATIVE_POST_REPAIR_MASTER_CHECKPOINT_V1/);
  assert.match(source, /state\.organization_id !== context\.organization_id/);
  assert.match(source, /state\.creative_project_id !== context\.creative_project_id/);
  assert.match(source, /state\.creative_mission_id !== context\.creative_mission_id/);
});

test("repaired master is persisted before Tribunal resumes", () => {
  const resume = source.match(/async resumeApprovedCouncil[\s\S]*$/)?.[0] || "";
  const repairAt = resume.indexOf("resumeApprovedCouncilPlan");
  const persistAt = resume.indexOf("persistPostRepairMasterCheckpoint(context, councilMaster)");
  const tribunalAt = resume.indexOf("reviewWithDurableResume");
  assert.ok(repairAt >= 0 && persistAt > repairAt && tribunalAt > persistAt);
});
test("resume prefers post-repair master over older Council checkpoint", () => {
  const resume = source.match(/async resumeApprovedCouncil[\s\S]*$/)?.[0] || "";
  const repaired = resume.indexOf("storedPostRepairMasterCheckpoint(context.project, context)");
  const council = resume.indexOf("storedCouncilCheckpoint(context.project, context)");
  assert.ok(repaired >= 0 && council > repaired);
});

test("successful Tribunal clears post-repair checkpoint", () => {
  const durable = source.match(/async function reviewWithDurableResume[\s\S]*?function bootstrapResolvedProductionRooms/)?.[0] || "";
  assert.match(durable, /clearPostRepairMasterCheckpoint\(context\)/);
});