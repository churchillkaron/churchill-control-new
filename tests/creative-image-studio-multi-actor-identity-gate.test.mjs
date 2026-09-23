import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const graph=fs.readFileSync("lib/creative/image/runtime/CreativeImageAssetGraphRuntime.js","utf8");
const foundation=fs.readFileSync("lib/creative/image/runtime/CreativeImageFoundationAuthorityRuntime.js","utf8");
const previs=fs.readFileSync("lib/creative/image/runtime/CreativeImagePrevisualizationAuthorityRuntime.js","utf8");
const pack=fs.readFileSync("lib/creative/image/runtime/CreativeImageProductionPackageRuntime.js","utf8");
const gate=fs.readFileSync("lib/creative/production-graph/runtime/CreativeVisualProductionExecutionGate.js","utf8");

test("single governed actor identity can be inferred from shot actors",()=>{
  assert.match(graph,/function actorIdentityKeys/);
  assert.match(graph,/actorKeys\.length===1\?actorKeys\[0\]:null/);
  assert.match(foundation,/keys\.length===1\?keys\[0\]:null/);
  assert.match(previs,/governedActorKeys\.length===1\?governedActorKeys\[0\]:null/);
  assert.match(pack,/governedActorKeys\.length===1\?governedActorKeys\[0\]:null/);
});

test("Image Studio does not generate one generic character sheet for ambiguous multi-actor shots",()=>{
  assert.match(graph,/characterIdentityAmbiguous/);
  assert.match(graph,/if\(!characterIdentityAmbiguous\(shot\)\) out\.push\("CHARACTER_SHEET"\)/);
  assert.match(graph,/subject_identity_ambiguous:characterIdentityAmbiguous\(s\)/);
});

test("foundation and previs fail closed when multiple governed actors lack primary subject identity",()=>{
  assert.match(foundation,/IMAGE_FOUNDATION_SUBJECT_IDENTITY_REQUIRED/);
  assert.match(foundation,/actor_identity_keys:actorKeys/);
  assert.match(previs,/PREVIS_SUBJECT_IDENTITY_REQUIRED/);
  assert.match(previs,/subject_identity_ambiguous/);
});

test("production package and video dispatch cannot silently pick an arbitrary actor",()=>{
  assert.match(pack,/PRODUCTION_PACKAGE_SUBJECT_IDENTITY_REQUIRED/);
  assert.match(pack,/actor_identity_keys:governedActorKeys/);
  assert.match(gate,/IMAGE_STUDIO_SUBJECT_IDENTITY_REQUIRED/);
  assert.match(gate,/actor_identity_keys: governedActorKeys/);
});
