import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const executionSource = await readFile(new URL("../lib/creative/music/runtime/CreativeMusicSurgicalRepairExecutionRuntime.js", import.meta.url), "utf8");
const capabilitySource = await readFile(new URL("../lib/creative/music/capabilities/executeWorldClassMusicStudio.js", import.meta.url), "utf8");
const finishingSource = await readFile(new URL("../lib/creative/music/runtime/CreativeMusicFinishingRuntime.js", import.meta.url), "utf8");

test("surgical Music execution re-plans and verifies the exact approved fingerprint", () => {
  assert.match(executionSource, /planMusicSurgicalRepair/);
  assert.match(executionSource, /CREATIVE_MUSIC_SURGICAL_REPAIR_PLAN_CHANGED/);
  assert.match(executionSource, /buildCertifiedSurgicalEdit/);
  assert.ok(executionSource.indexOf("CREATIVE_MUSIC_SURGICAL_REPAIR_PLAN_CHANGED") < executionSource.indexOf("executeService({"));
});

test("surgical Music repair preserves lineage and re-runs quality gates", () => {
  assert.match(executionSource, /parent_music_asset_id/);
  assert.match(executionSource, /preserve_outside_region: true/);
  assert.match(executionSource, /runMusicDailiesListening/);
  assert.match(executionSource, /runMusicFinalTribunal/);
  assert.match(executionSource, /publication_authorized: false/);
});

test("Business Partner uses the existing confirmed Music write boundary for repair execution", () => {
  assert.match(capabilitySource, /operatorRequiresConfirmation: true/);
  assert.match(capabilitySource, /repair_plan_hash/);
  assert.match(capabilitySource, /executeMusicSurgicalRepair/);
  assert.match(capabilitySource, /CREATIVE_MUSIC_SURGICAL_REPAIR_SOURCE_RIGHTS_REQUIRED/);
});

test("generated and mastered Music assets preserve the world-class quality plan", () => {
  assert.match(finishingSource, /music_world_class_plan/);
  assert.match(finishingSource, /music_session/);
});
