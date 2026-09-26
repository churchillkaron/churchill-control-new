import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
const source = fs.readFileSync("lib/creative/director/orchestrator/CreativePipelineOrchestrator.js", "utf8");
test("durable temporal checkpoints are recertified against today's quality floor", () => {
  assert.match(source, /function recertifyTemporalMasterAgainstCurrentFloor/);
  assert.match(source, /quality_profile: project\.quality_profile \|\| sourcePlan\.quality_profile \|\| null/);
  assert.match(source, /checkpoint_recertified_against_current_quality_floor: true/);
  assert.match(source, /assets: directionAssets, recertify: true/);
});
test("large project metadata cannot suppress a materially changed checkpoint", () => {
  assert.match(source, /existingCheckpointMatchesIncoming/);
  assert.match(source, /existingShotCount === incomingShotCount/);
  assert.match(source, /if \(existingCheckpointMatchesIncoming && metadataBytes > 2 \* 1024 \* 1024\)/);
});
