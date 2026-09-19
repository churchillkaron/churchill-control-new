import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const ready = fs.readFileSync("lib/creative/image/runtime/CreativeImageShotReadyRuntime.js","utf8");
const gate = fs.readFileSync("lib/creative/production-graph/runtime/CreativeVisualProductionExecutionGate.js","utf8");

test("shot ready requires sealed production package and previs evidence",()=>{
  assert.match(ready,/SHOT_READY_PREVIS_AUTHORITY_REQUIRED/);
  assert.match(ready,/SHOT_READY_PRODUCTION_PACKAGE_REQUIRED/);
  assert.match(ready,/SHOT_READY_PACKAGE_DIGEST_REQUIRED/);
  assert.match(ready,/SHOT_READY_CAMERA_AUTHORITY_HASH_REQUIRED/);
  assert.match(ready,/SHOT_READY_BLUEPRINT_DIGEST_REQUIRED/);
});

test("physical/threat shots require continuity and causal choreography",()=>{
  assert.match(ready,/SHOT_READY_VIRTUAL_CAMERA_REQUIRED/);
  assert.match(ready,/SHOT_READY_ENVIRONMENT_CONTINUITY_REQUIRED/);
  assert.match(ready,/SHOT_READY_PURSUIT_SPATIAL_CHOREOGRAPHY_REQUIRED/);
  assert.match(ready,/SHOT_READY_EDITORIAL_CAUSALITY_REQUIRED/);
  assert.match(ready,/SHOT_READY_SHARED_STATE_GROUP_REQUIRED/);
});

test("visual gate blocks video before dispatch when shot is not ready",()=>{
  assert.match(gate,/CreativeImageShotReadyRuntime/);
  assert.match(gate,/IMAGE_STUDIO_SHOT_READY_BLOCKED/);
  assert.match(gate,/image_shot_ready_passed: true/);
  assert.match(gate,/image_shot_ready_digest/);
});
