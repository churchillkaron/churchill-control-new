import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const pack = fs.readFileSync("lib/creative/image/runtime/CreativeImageAssetPackConsistencyRuntime.js", "utf8");
const graph = fs.readFileSync("lib/creative/image/runtime/CreativeImageAssetGraphRuntime.js", "utf8");
const handoff = fs.readFileSync("lib/creative/image/runtime/CreativeImageAssetHandoffRuntime.js", "utf8");
const queue = fs.readFileSync("lib/creative/production/queue/runtime/ProductionQueueRuntime.js", "utf8");

test("image asset packs are cross-reviewed as one visual world", () => {
  assert.match(pack, /asset-pack continuity supervisor/);
  assert.match(pack, /identity_consistency_score/);
  assert.match(pack, /wardrobe_continuity_score/);
  assert.match(pack, /world_consistency_score/);
  assert.match(pack, /threat_geometry_score/);
  assert.match(pack, /lens_language_score/);
  assert.match(pack, /production_usability_score/);
});

test("pack review uses strict premium thresholds", () => {
  assert.match(pack, /pack_consistency_score >= 94/);
  assert.match(pack, /identity_consistency_score >= 96/);
  assert.match(pack, /world_consistency_score >= 95/);
  assert.match(pack, /threat_geometry_score >= 96/);
  assert.match(pack, /CREATIVE_IMAGE_ASSET_PACK_QC_SEAL_V1/);
});

test("image generation assets inherit identity and world authority", () => {
  assert.match(graph, /identity_atlas_asset_node_id/);
  assert.match(graph, /identity_atlas_hash/);
  assert.match(graph, /persistent_subject_lock/);
  assert.match(graph, /world_consistency_contract/);
});

test("continuity-linked downstream handoff requires pack QC", () => {
  assert.match(handoff, /image_asset_pack_qc_sealed!==true/);
});

test("production queue runs asset pack review and reconciliation", () => {
  assert.match(queue, /CreativeImageAssetPackConsistencyRuntime/);
  assert.match(queue, /imageAssetPackReviews/);
  assert.match(queue, /imageAssetPackQc/);
});
