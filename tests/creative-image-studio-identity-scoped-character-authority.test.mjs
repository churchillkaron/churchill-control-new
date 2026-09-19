import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const graph=fs.readFileSync("lib/creative/image/runtime/CreativeImageAssetGraphRuntime.js","utf8");
const handoff=fs.readFileSync("lib/creative/image/runtime/CreativeImageAssetHandoffRuntime.js","utf8");
const previs=fs.readFileSync("lib/creative/image/runtime/CreativeImagePrevisualizationAuthorityRuntime.js","utf8");
const pack=fs.readFileSync("lib/creative/image/runtime/CreativeImageProductionPackageRuntime.js","utf8");
const gate=fs.readFileSync("lib/creative/production-graph/runtime/CreativeVisualProductionExecutionGate.js","utf8");
const reconcile=fs.readFileSync("lib/creative/image/runtime/CreativeImageAssetReconciliationRuntime.js","utf8");

test("character sheet scope includes subject identity when available",()=>{
  assert.match(graph,/function identityKey/);
  assert.match(graph,/assetClass==="CHARACTER_SHEET"&&subjectKey/);
  assert.match(graph,/\?"SUBJECT"/);
  assert.match(graph,/sceneScope\+":"\+subjectKey/);
  assert.match(graph,/subject_identity_key:identityKey\(shot\)/);
});

test("scene evidence is filtered per character identity for character sheets",()=>{
  assert.match(graph,/subject_identity_key:identityKey\(s\)/);
  assert.match(graph,/assetClass==="CHARACTER_SHEET"&&subjectKey/);
  assert.match(graph,/filter\(s=>text\(s\.subject_identity_key\)===subjectKey\)/);
});

test("handoff supports exact identity-key filtering",()=>{
  assert.match(handoff,/identity_key=null/);
  assert.match(handoff,/node\.metadata\?\.subject_identity_key/);
  assert.match(reconcile,/subject_identity_key:/);
  assert.match(reconcile,/identity_profile_id:/);
});

test("previs package and video execution select exact character authority",()=>{
  assert.match(previs,/identity_key:identityKey\|\|null/);
  assert.match(pack,/identity_key:identityKey\|\|null/);
  assert.match(gate,/identity_key: identityKey \|\| null/);
});
