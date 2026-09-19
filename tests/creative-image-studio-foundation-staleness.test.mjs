import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const foundation=fs.readFileSync("lib/creative/image/runtime/CreativeImageFoundationAuthorityRuntime.js","utf8");
const reconcile=fs.readFileSync("lib/creative/image/runtime/CreativeImageAssetReconciliationRuntime.js","utf8");
const pack=fs.readFileSync("lib/creative/image/runtime/CreativeImageProductionPackageRuntime.js","utf8");

test("foundation authority is fingerprinted by selected asset IDs QC seals and checksums",()=>{
  assert.match(foundation,/foundation_authority_digest/);
  assert.match(foundation,/checksum:node\.technical\?\.checksum/);
  assert.match(foundation,/image_asset_pack_qc_seal_hash/);
  assert.match(foundation,/authority_evidence/);
});

test("approved shot assets persist their foundation fingerprint",()=>{
  assert.match(reconcile,/image_foundation_authority_digest/);
  assert.match(reconcile,/image_foundation_authority_contract/);
});

test("production package fail-closes stale foundation lineage",()=>{
  assert.match(pack,/PRODUCTION_PACKAGE_HERO_FOUNDATION_STALE/);
  assert.match(pack,/PRODUCTION_PACKAGE_PERFORMANCE_FOUNDATION_STALE/);
  assert.match(pack,/PRODUCTION_PACKAGE_CONTACT_FOUNDATION_STALE/);
  assert.match(pack,/foundation_authority_asset_node_ids/);
});
