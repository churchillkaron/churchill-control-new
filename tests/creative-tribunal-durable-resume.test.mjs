import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const tribunal = fs.readFileSync(
  new URL("../lib/creative/director/runtime/CreativeDynamicTribunalRuntime.js", import.meta.url),
  "utf8",
);
const workflow = fs.readFileSync(
  new URL("../lib/creative/director/runtime/CreativeWorkflowResolutionRuntime.js", import.meta.url),
  "utf8",
);

test("repair approval boundary preserves Tribunal resume package", () => {
  assert.match(tribunal, /let repair;[\s\S]*try \{[\s\S]*CREATIVE_DYNAMIC_TRIBUNAL_REPAIR_V1/);
  assert.match(tribunal, /const resumePackage = tribunalResumePackage\(\{ plan, tribunal \}\)/);
  assert.match(tribunal, /error\.resume_package = resumePackage/);
  assert.match(tribunal, /error\.repaired_plan = error\.repaired_plan \|\| plan/);
});

test("workflow persists sealed Tribunal resume state with exact scope identity", () => {
  assert.match(workflow, /CREATIVE_TRIBUNAL_DURABLE_RESUME_V1/);
  assert.match(workflow, /organization_id: context\.organization_id/);
  assert.match(workflow, /creative_mission_id: context\.creative_mission_id/);
  assert.match(workflow, /creative_project_id: context\.creative_project_id/);
  assert.match(workflow, /resume_package: resumePackage/);
});
test("workflow automatically loads stored Tribunal resume state", () => {
  assert.match(workflow, /storedTribunalResume\(context\.project, context\)/);
  assert.match(workflow, /input\.tribunal_resume_package[\s\S]*approvedMaster\.tribunal_resume_package[\s\S]*storedTribunalResume/);
});

test("successful Tribunal clears durable resume state", () => {
  assert.match(workflow, /const master = await CreativeDynamicTribunalRuntime\.review\(reviewInput\)/);
  assert.match(workflow, /await clearTribunalResume\(context\)/);
  assert.match(workflow, /delete metadata\[TRIBUNAL_RESUME_METADATA_KEY\]/);
});

test("resume persistence failure never replaces the original Tribunal error", () => {
  assert.match(workflow, /error\.resume_persistence_error = String/);
  assert.match(workflow, /throw error;/);
});