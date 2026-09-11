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

test("rejected Tribunal emits a sealed deterministic resume package", () => {
  assert.match(tribunal, /CREATIVE_TRIBUNAL_RESUME_PACKAGE_V1/);
  assert.match(tribunal, /settled_review_source_plan: reviewSourcePlan/);
  assert.match(tribunal, /settled_review_plan_hash: hash\(reviewSourcePlan\)/);
  assert.match(tribunal, /blockers: list\(tribunal\?\.verdict\?\.blockers\)/);
  assert.match(tribunal, /error\.resume_package = resumePackage/);
});

test("resume package settles passed reviewers only", () => {
  assert.match(tribunal, /review\.passed === true/);
  assert.match(tribunal, /finite\(review\.score\) >= floor/);
  assert.match(tribunal, /!text\(review\.fatal_rejection_reason\)/);
});

test("approved Council workflow consumes Tribunal resume package directly", () => {
  assert.match(workflow, /input\.tribunal_resume_package/);
  assert.match(workflow, /tribunalResume\.review_panel/);
  assert.match(workflow, /tribunalResume\.settled_reviews/);
  assert.match(workflow, /tribunalResume\.settled_review_plan_hash/);
  assert.match(workflow, /tribunalResume\.settled_review_source_plan/);
});
