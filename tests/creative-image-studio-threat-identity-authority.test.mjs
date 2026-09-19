import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const graph=fs.readFileSync("lib/creative/image/runtime/CreativeImageAssetGraphRuntime.js","utf8");
const handoff=fs.readFileSync("lib/creative/image/runtime/CreativeImageAssetHandoffRuntime.js","utf8");
const reconcile=fs.readFileSync("lib/creative/image/runtime/CreativeImageAssetReconciliationRuntime.js","utf8");
const foundation=fs.readFileSync("lib/creative/image/runtime/CreativeImageFoundationAuthorityRuntime.js","utf8");
const previs=fs.readFileSync("lib/creative/image/runtime/CreativeImagePrevisualizationAuthorityRuntime.js","utf8");
const productionPackage=fs.readFileSync("lib/creative/image/runtime/CreativeImageProductionPackageRuntime.js","utf8");
const gate=fs.readFileSync("lib/creative/production-graph/runtime/CreativeVisualProductionExecutionGate.js","utf8");
const vfx=fs.readFileSync("lib/creative/vfx/runtime/CreativePremiumLayerTaskMaterializationRuntime.js","utf8");
const pack=fs.readFileSync("lib/creative/image/runtime/CreativeImageAssetPackConsistencyRuntime.js","utf8");
const multiview=fs.readFileSync("lib/creative/image/runtime/CreativeImageAssetMultiViewRuntime.js","utf8");

test("threat design scope includes governed threat identity when available",()=>{
  assert.ok(graph.includes("function threatKey"));
  assert.ok(graph.includes('assetClass==="THREAT_DESIGN"&&governedThreatKey'));
  assert.ok(graph.includes('?"THREAT"'));
  assert.ok(graph.includes('sceneScope+":"+governedThreatKey'));
  assert.ok(graph.includes("threat_identity_key:threatKey(shot)"));
});

test("threat design scene evidence is filtered to the matching governed threat",()=>{
  assert.ok(graph.includes("filter(s=>text(s.threat_identity_key)===governedThreatKey)"));
  assert.ok(graph.includes("threat_identity_key:governedThreatKey"));
});

test("approved image assets persist threat identity and handoff can filter by it",()=>{
  assert.ok(reconcile.includes("threat_identity_key:"));
  assert.ok(handoff.includes("threat_identity_key=null"));
  assert.ok(handoff.includes("node.metadata?.threat_identity_key"));
});

test("foundation authority fails closed when multiple threats exist without an identity key",()=>{
  assert.ok(foundation.includes("IMAGE_FOUNDATION_THREAT_IDENTITY_REQUIRED"));
  assert.ok(foundation.includes("threat_identity_key:governedThreatKey"));
  assert.ok(foundation.includes("threatSelection.candidate_count>1"));
});

test("previs production package and video execution bind exact threat identity",()=>{
  assert.ok(previs.includes("PREVIS_THREAT_IDENTITY_REQUIRED"));
  assert.ok(previs.includes("threat_identity_key:governedThreatKey"));
  assert.ok(productionPackage.includes("PRODUCTION_PACKAGE_THREAT_IDENTITY_REQUIRED"));
  assert.ok(productionPackage.includes("threat_identity_key:governedThreatKey||null"));
  assert.ok(gate.includes("IMAGE_STUDIO_THREAT_IDENTITY_REQUIRED"));
  assert.ok(gate.includes("threat_identity_key: governedThreatKey"));
});

test("premium VFX requires the exact approved threat identity and validates explicit sources",()=>{
  assert.ok(vfx.includes("function threatIdentityKey"));
  assert.ok(vfx.includes("threat_identity_key:governedThreatKey"));
  assert.ok(vfx.includes("THREAT_HERO_IDENTITY_REQUIRED"));
  assert.ok(vfx.includes("THREAT_HERO_EXPLICIT_SOURCE_NOT_APPROVED"));
});

test("pack QC keeps distinct threat identities separate and batches with matching threat anchors",()=>{
  assert.ok(pack.includes("threat_identity_separation_valid"));
  assert.ok(pack.includes("threat_geometry_by_key"));
  assert.ok(pack.includes("Distinct governed threat keys"));
  assert.ok(pack.includes("threatByIdentity"));
  assert.ok(pack.includes("threatIdentityKey(candidate)"));
});

test("multi-view threat derivatives preserve threat identity lineage",()=>{
  assert.ok(multiview.includes("threat_identity_key:parent.metadata?.threat_identity_key||null"));
  assert.ok(multiview.includes("threat_identity_key:task.metadata?.threat_identity_key||null"));
});
