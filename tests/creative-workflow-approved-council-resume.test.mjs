import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const workflow = fs.readFileSync(
  new URL("../lib/creative/director/runtime/CreativeWorkflowResolutionRuntime.js", import.meta.url),
  "utf8",
);
const council = fs.readFileSync(
  new URL("../lib/creative/director/runtime/CreativeConceptCouncilRuntime.js", import.meta.url),
  "utf8",
);

test("workflow can resume from an approved Council without replaying Council", () => {
  assert.match(workflow, /async resumeApprovedCouncil\(/);
  assert.match(workflow, /CreativeConceptCouncilRuntime\.resumeApprovedCouncilPlan\(/);
  assert.doesNotMatch(workflow.match(/async resumeApprovedCouncil[\s\S]*$/)?.[0] || "", /CreativeConceptCouncilRuntime\.run\(/);
  assert.doesNotMatch(workflow.match(/async resumeApprovedCouncil[\s\S]*$/)?.[0] || "", /CreativeMasterPlanRuntime\.create\(/);
});

test("resume forwards settled Tribunal review state only after Master repair", () => {
  const resume = workflow.match(/async resumeApprovedCouncil[\s\S]*$/)?.[0] || "";
  const repairAt = resume.indexOf("resumeApprovedCouncilPlan");
  const tribunalAt = resume.indexOf("CreativeDynamicTribunalRuntime.review");
  assert.ok(repairAt >= 0 && tribunalAt > repairAt);
  assert.match(resume, /settled_reviews: input\.settled_reviews \|\| tribunalResume\.settled_reviews \|\| \[\]/);
  assert.match(resume, /settled_review_plan_hash: input\.settled_review_plan_hash \|\| tribunalResume\.settled_review_plan_hash \|\| null/);
});
