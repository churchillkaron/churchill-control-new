import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const material=fs.readFileSync("lib/creative/image/runtime/CreativeImageMaterialTruthPackRuntime.js","utf8");
const measurement=fs.readFileSync("lib/creative/image/runtime/CreativeImageMaterialMeasurementRuntime.js","utf8");

test("material truth generation fingerprints exact source visual versions",()=>{
  assert.match(material,/function stableSourceVersion/);
  assert.match(material,/function materialSourceDigest/);
  assert.match(material,/source_asset_versions:sourceVersions/);
  assert.match(material,/source_asset_version_digest:sourceDigest/);
  assert.match(material,/material_truth_source_asset_version_digest:sourceDigest/);
});

test("material truth reconciliation fails closed if source authority changes before persistence",()=>{
  assert.match(material,/MATERIAL_TRUTH_SOURCE_STALE_BEFORE_RECONCILIATION/);
  assert.match(material,/IMAGE_MATERIAL_TRUTH_SOURCE_STALE/);
  assert.match(material,/material_truth_source_stale_at:"RECONCILIATION"/);
});

test("approved material truth is revoked when source pixels selection or repair lineage changes",()=>{
  assert.match(material,/export function isMaterialTruthSourceCurrent/);
  assert.match(material,/Material truth source authority changed; prior material reference revoked/);
  assert.match(material,/material_truth_pack_qc_sealed:false/);
  assert.match(material,/material_measurement_sealed:false/);
  assert.match(material,/release_approved:false/);
});

test("material QC revalidates source lineage at settlement",()=>{
  assert.match(material,/const sourcesCurrent=/);
  assert.match(material,/reviewedNodes\.every\(node=>isMaterialTruthSourceCurrent\(node,nodes\)\)/);
  assert.match(material,/IMAGE_MATERIAL_TRUTH_SOURCE_STALE_DURING_QC/);
  assert.match(material,/source_asset_version_digests:/);
});

test("material handoff excludes stale or missing source authority",()=>{
  assert.match(material,/approvedMaterialNode\(node,asset_nodes\)/);
  assert.match(material,/isMaterialTruthSourceCurrent\(node,assetNodes\)/);
  assert.match(material,/source_current:true/);
});

test("material measurement refuses stale references before execution and at settlement",()=>{
  assert.match(measurement,/isMaterialTruthSourceCurrent/);
  assert.match(measurement,/eligible\(node\) &&\s*isMaterialTruthSourceCurrent\(node,nodes\)/);
  assert.match(measurement,/const sourceCurrent=isMaterialTruthSourceCurrent\(node,nodes\)/);
  assert.match(measurement,/IMAGE_MATERIAL_TRUTH_SOURCE_STALE_DURING_MEASUREMENT/);
});
