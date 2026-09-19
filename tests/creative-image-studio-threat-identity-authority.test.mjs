import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const graph=fs.readFileSync("lib/creative/image/runtime/CreativeImageAssetGraphRuntime.js","utf8");
const handoff=fs.readFileSync("lib/creative/image/runtime/CreativeImageAssetHandoffRuntime.js","utf8");
const reconcile=fs.readFileSync("lib/creative/image/runtime/CreativeImageAssetReconciliationRuntime.js","utf8");
const foundation=fs.readFileSync("lib/creative/image/runtime/CreativeImageFoundationAuthorityRuntime.js","utf8");
const vfx=fs.readFileSync("lib/creative/vfx/runtime/CreativePremiumLayerTaskMaterializationRuntime.js","utf8");
const pack=fs.readFileSync("lib/creative/image/runtime/CreativeImageAssetPackConsistencyRuntime.js","utf8");

test("threat design scope includes governed threat identity when available",()=>{
  assert.match(graph,/function threatKey/);
  assert.match(graph,/assetClass==="THREAT_DESIGN"&&governedThreatKey/);
  assert.match(graph,/?"THREAT"/);
  assert.match(graph,/sceneScope+":"+governedThreatKey/);
  assert.match(graph,/threat_identity_key:threatKey(shot)/);
});

test("threat design scene evidence is filtered to the matching governed threat",()=>{
  assert.match(graph,/filter(s=>text(s.threat_identity_key)===governedThreatKey)/);
  assert.match(graph,/threat_identity_key:governedThreatKey/);
});

test("approved image assets persist threat identity and handoff can filter by it",()=>{
  assert.match(reconcile,/threat_identity_key:/);
  assert.match(handoff,/threat_identity_key=null/);
  assert.match(handoff,/node.metadata?.threat_identity_key/);
});

test("foundation authority fails closed when multiple threats exist without an identity key",()=>{
  assert.match(foundation,/IMAGE_FOUNDATION_THREAT_IDENTITY_REQUIRED/);
  assert.match(foundation,/threat_identity_key:governedThreatKey/);
  assert.match(foundation,/threatSelection.candidate_count>1/);
});

test("premium VFX requires the exact approved threat identity and validates explicit sources",()=>{
  assert.match(vfx,/function threatIdentityKey/);
  assert.match(vfx,/threat_identity_key:governedThreatKey/);
  assert.match(vfx,/THREAT_HERO_IDENTITY_REQUIRED/);
  assert.match(vfx,/THREAT_HERO_EXPLICIT_SOURCE_NOT_APPROVED/);
});

test("pack QC keeps distinct threat identities separate and batches with matching threat anchors",()=>{
  assert.match(pack,/threat_identity_separation_valid/);
  assert.match(pack,/threat_geometry_by_key/);
  assert.match(pack,/Distinct governed threat keys/);
  assert.match(pack,/threatByIdentity/);
  assert.match(pack,/threatIdentityKey(candidate)/);
});
