import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
const source = fs.readFileSync("lib/creative/director/runtime/CreativeWorkflowResolutionRuntime.js", "utf8");
test("user-authorized recovered story can seed temporal direction with matching Tribunal authority", () => {
  assert.match(source, /function storedRecoveredTemporalAuthoritySeed/);
  assert.match(source, /CREATIVE_STORY_LINEAGE_RECOVERY_V1/);
  assert.match(source, /recovery\.user_authorized !== true/);
  assert.match(source, /temporalConceptId !== recoveredConceptId/);
  assert.match(source, /tribunal\.passed !== true \|\| tribunal\.verdict\?\.passed !== true/);
  assert.match(source, /recovered_temporal_authority_seed: true/);
});
test("recovered temporal seed explicitly discards stale scene-shot architecture", () => {
  assert.match(source, /scenes: \[\]/);
  assert.match(source, /stale_scene_and_shot_architecture_reuse_forbidden: true/);
  assert.match(source, /const recoveredTemporalAuthoritySeed = forceDirectionRestart/);
  assert.match(source, /let initialMaster = recoveredTemporalAuthoritySeed \|\| await recoverSettledInitialMaster/);
});
test("recovered temporal seed bypasses redundant Council and Tribunal regeneration", () => {
  assert.match(source, /if \(recoveredTemporalAuthoritySeed\) \{\s*master = recoveredTemporalAuthoritySeed;/);
});
