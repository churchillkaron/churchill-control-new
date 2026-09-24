import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const material=fs.readFileSync("lib/creative/image/runtime/CreativeImageMaterialTruthPackRuntime.js","utf8");
const pack=fs.readFileSync("lib/creative/image/runtime/CreativeImageProductionPackageRuntime.js","utf8");
const previs=fs.readFileSync("lib/creative/image/runtime/CreativeImagePrevisualizationAuthorityRuntime.js","utf8");
const gate=fs.readFileSync("lib/creative/production-graph/runtime/CreativeVisualProductionExecutionGate.js","utf8");
const vfx=fs.readFileSync("lib/creative/vfx/runtime/CreativePremiumLayerTaskMaterializationRuntime.js","utf8");

test("material truth separates global subject and threat surface authority",()=>{
  assert.match(material,/function materialScopeKind/);
  assert.match(material,/WET_SKIN/);
  assert.match(material,/WET_FABRIC/);
  assert.match(material,/WET_METAL/);
  assert.match(material,/SEARCHLIGHT_ATMOSPHERE_INTERACTION/);
  assert.match(material,/material_subject_identity_key/);
  assert.match(material,/material_threat_identity_key/);
});

test("material reference generation cannot mix governed people or threats",()=>{
  assert.match(material,/Do not borrow skin\/fabric texture/);
  assert.match(material,/Do not borrow metal\/glass\/coating\/searchlight material language/);
  assert.match(material,/materialScopeVariants\(key,sourceNodes\)/);
  assert.match(material,/MATERIAL_TRUTH_SCOPED_SOURCE_PACK_REQUIRED/);
});

test("material QC is partitioned by identity scope",()=>{
  assert.match(material,/const groupKey=\[group,scopeKind,scopeIdentity\]\.join/);
  assert.match(material,/material_scope_kind:scopeKind/);
  assert.match(material,/material_scope_identity_key/);
});

test("material handoff returns only global plus matching identity scopes",()=>{
  assert.match(material,/identity_key=null/);
  assert.match(material,/threat_identity_key=null/);
  assert.match(material,/if\(scopeKind==="SUBJECT"\)/);
  assert.match(material,/if\(scopeKind==="THREAT"\)/);
  assert.match(material,/qc_seal_hashes/);
});

test("previs production package video and VFX request scoped material truth",()=>{
  assert.match(previs,/identity_key:governedIdentityKey/);
  assert.match(previs,/threat_identity_key:governedThreatKey\|\|requestedThreatKey/);
  assert.match(pack,/identity_key:governedIdentityKey/);
  assert.match(pack,/governedThreatKey=foundationAuthority\.threat_identity_key\|\|requestedThreatKey\|\|null/);
  assert.match(pack,/CreativeImageMaterialTruthPackRuntime\.select\(\{asset_nodes,continuity_group_id:group,identity_key:governedIdentityKey,threat_identity_key:governedThreatKey\}\)/);
  assert.match(gate,/identity_key: governedIdentityKey/);
  assert.match(gate,/threat_identity_key: governedThreatKey/);
  assert.match(vfx,/threat_identity_key:threatIdentityKey/);
});
