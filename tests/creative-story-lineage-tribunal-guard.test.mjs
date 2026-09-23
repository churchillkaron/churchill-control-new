import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const workflow = fs.readFileSync(
  new URL("../lib/creative/director/runtime/CreativeWorkflowResolutionRuntime.js", import.meta.url),
  "utf8",
);
const tribunal = fs.readFileSync(
  new URL("../lib/creative/director/runtime/CreativeDynamicTribunalRuntime.js", import.meta.url),
  "utf8",
);

test("historical Tribunal repairs require an exact source-plan hash before replay", () => {
  assert.match(tribunal, /creative_repair_source_plan_hash:\s*hash\(canonicalReviewPlan\(plan\)\)/);
  assert.match(workflow, /creative_repair_source_plan_hash/);
  assert.match(workflow, /repairSourcePlanHash !== currentSourcePlanHash\) continue/);
});

test("stale Tribunal-approved checkpoint is retired when current plan lineage differs", () => {
  assert.match(workflow, /reviewPlanHash\(approvedCheckpoint\.plan\)[\s\S]*reviewPlanHash\(currentPlan\)/);
  assert.match(workflow, /await clearTribunalApprovedMaster\(context\)/);
});
