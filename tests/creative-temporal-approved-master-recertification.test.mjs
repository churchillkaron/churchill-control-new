import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
const orchestrator = fs.readFileSync("lib/creative/director/orchestrator/CreativePipelineOrchestrator.js", "utf8");
const temporal = fs.readFileSync("lib/creative/director/runtime/CreativeTemporalMasterPlanRuntime.js", "utf8");
test("incoming approved temporal masters must pass the current floor before reuse", () => {
  assert.match(orchestrator, /const currentTribunalMaster = recertifyTemporalMasterAgainstCurrentFloor/);
  assert.match(orchestrator, /incomingMasterIsLaterAuthority = Boolean\(\s*currentTribunalMaster/);
  assert.match(orchestrator, /approved_master: tribunalApprovedMaster/);
});
test("stale scene-shot architecture is re-authored while approved creative authority survives", () => {
  assert.match(temporal, /CREATIVE_STALE_APPROVED_MASTER_REAUTHORING_V1/);
  assert.match(temporal, /approved_concept_and_story_preserved: true/);
  assert.match(temporal, /stale_scene_and_shot_architecture_reuse_forbidden: true/);
  assert.match(temporal, /quality_profile: project\.quality_profile \|\| approvedMasterPlan\.quality_profile \|\| null/);
});
