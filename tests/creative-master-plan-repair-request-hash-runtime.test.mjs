import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync("lib/creative/director/runtime/CreativeMasterPlanRuntime.js", "utf8");

test("each master-plan repair execution derives its request hash from exact repair state", () => {
  assert.match(source, /const repairRequestHash = createHash\("sha256"\)\.update\(JSON\.stringify\(\{/);
  assert.match(source, /operation: "MASTER_PLAN_CONTRACT_REPAIR_V1"/);
  assert.match(source, /story: recoveredStoryFingerprint\(repairPlan\)/);
  assert.match(source, /validation_message: repairValidationError\?\.message/);
  assert.match(source, /creative_direction_request_hash: repairRequestHash/);
});

test("repair request preserves exact plan and failures while deduplicating support context", () => {
  assert.match(source, /plan,\s*rules:/);
  assert.match(source, /validation_failure:/);
  assert.match(source, /brief: creativeBriefPromptSnapshot\(brief\)/);
  assert.match(source, /production_capability_authority:/);
});
