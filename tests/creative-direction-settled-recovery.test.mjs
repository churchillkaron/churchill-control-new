import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync("lib/creative/director/runtime/CreativeWorkflowResolutionRuntime.js", "utf8");

test("workflow resolution reuses settled governed master-plan reasoning before creating again", () => {
  assert.match(source, /recoverSettledInitialMaster/);
  assert.match(source, /MASTER_PLAN_DYNAMIC_V2/);
  assert.match(source, /MASTER_PLAN_CONTRACT_REPAIR_V1/);
  assert.match(source, /CreativeMasterPlanRuntime\.resumeFromResult/);
  assert.match(source, /\|\|\s*await CreativeMasterPlanRuntime\.create/);
});

test("settled recovery is scoped to successful usage ids recorded on current approval operations", () => {
  assert.match(source, /project\?\.metadata\?\.paid_direction_approval/);
  assert.match(source, /UsageRuntime\.get\(entry\.usage_id\)/);
  assert.match(source, /usage\.status .*SUCCESS/);
});
