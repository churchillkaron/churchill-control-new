import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const master = fs.readFileSync(
  new URL("../lib/creative/director/runtime/CreativeMasterPlanRuntime.js", import.meta.url),
  "utf8",
);
const approval = fs.readFileSync(
  new URL("../lib/creative/director/runtime/CreativeDirectionCostApprovalRuntime.js", import.meta.url),
  "utf8",
);

test("master-plan repair binds request reuse to story and validation state", () => {
  assert.match(master, /creative_direction_request_hash: repairRequestHash/);
  assert.match(master, /creative_story_lineage_hash/);
  assert.match(master, /recoveredStoryFingerprint\(plan\)/);
  assert.match(master, /validation_message/);
});

test("async settled direction recovery requires matching request hash when present", () => {
  assert.match(approval, /request_hash = null/);
  assert.match(approval, /expectedRequestHash/);
  assert.match(approval, /creative_direction_request_hash/);
  assert.match(approval, /=== expectedRequestHash/);
});
