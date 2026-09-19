import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const graph=fs.readFileSync("lib/creative/image/runtime/CreativeImageAssetGraphRuntime.js","utf8");
const handoff=fs.readFileSync("lib/creative/image/runtime/CreativeImageAssetHandoffRuntime.js","utf8");
const previs=fs.readFileSync("lib/creative/image/runtime/CreativeImagePrevisualizationAuthorityRuntime.js","utf8");
const pack=fs.readFileSync("lib/creative/image/runtime/CreativeImageProductionPackageRuntime.js","utf8");
const gate=fs.readFileSync("lib/creative/production-graph/runtime/CreativeVisualProductionExecutionGate.js","utf8");

test("scene-shared Image Studio assets are authored from the full scene continuum",()=>{
  assert.match(graph,/CREATIVE_IMAGE_SCENE_AUTHORITY_EVIDENCE_V1/);
  assert.match(graph,/SCENE-WIDE AUTHORITY EVIDENCE/);
  assert.match(graph,/pursuit_performance_choreography/);
  assert.match(graph,/environmental_continuity_state/);
  assert.match(graph,/continuity_invariants/);
  assert.match(graph,/persistent_subject_lock/);
});

test("new shots do not independently generate a continuity-reference frame",()=>{
  const required=graph.slice(graph.indexOf("function requiredAssets"),graph.indexOf("function addEdge"));
  assert.match(required,/out\.push\("HERO_FRAME"\)/);
  assert.doesNotMatch(required,/out\.push\("HERO_FRAME","CONTINUITY_REFERENCE"\)/);
});

test("continuity authority prefers a dedicated legacy reference then aliases selected hero",()=>{
  assert.match(handoff,/selectContinuityAuthority/);
  assert.match(handoff,/DEDICATED_CONTINUITY_REFERENCE/);
  assert.match(handoff,/SELECTED_HERO_FRAME_ALIAS/);
  assert.match(handoff,/continuity_reuses_hero/);
});

test("previs package and video gate bind the same continuity authority contract",()=>{
  assert.match(previs,/selectContinuity/);
  assert.match(previs,/continuity_reuses_hero/);
  assert.match(pack,/selectContinuity/);
  assert.match(pack,/reuses_hero/);
  assert.match(gate,/selectContinuity/);
  assert.match(gate,/image_studio_continuity_reuses_hero/);
});
