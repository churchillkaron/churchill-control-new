import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const repair = fs.readFileSync("lib/creative/image/runtime/CreativeImageAssetLocalizedRepairRuntime.js", "utf8");
const pack = fs.readFileSync("lib/creative/image/runtime/CreativeImageAssetPackConsistencyRuntime.js", "utf8");
const multiview = fs.readFileSync("lib/creative/image/runtime/CreativeImageAssetMultiViewRuntime.js", "utf8");
const derivative = fs.readFileSync("lib/creative/image/runtime/CreativeImageAssetDerivativeQcRuntime.js", "utf8");
const handoff = fs.readFileSync("lib/creative/image/runtime/CreativeImageAssetHandoffRuntime.js", "utf8");
const queue = fs.readFileSync("lib/creative/production/queue/runtime/ProductionQueueRuntime.js", "utf8");

test("Image Studio QC emits asset-specific localized repair evidence", () => {
  assert.match(pack, /affected_asset_node_ids/);
  assert.match(pack, /repair_regions_by_asset/);
  assert.match(multiview, /affected_asset_node_ids/);
  assert.match(multiview, /repair_regions_by_asset/);
  assert.match(derivative, /affected_asset_node_ids/);
  assert.match(derivative, /repair_regions_by_asset/);
});

test("localized repair uses image edit and forbids broad regeneration", () => {
  assert.match(repair, /ai\.image\.inpaint/);
  assert.match(repair, /repair_mask_asset_node_id/);
  assert.match(repair, /exact_unmasked_pixel_preservation_required:true/);
  assert.match(repair, /change_only_declared_regions:true/);
  assert.match(repair, /full_frame_regeneration_forbidden:true/);
  assert.match(repair, /preserve_unaffected_regions:true/);
  assert.match(repair, /preserve_camera_authority:true/);
  assert.match(repair, /IMAGE_LOCALIZED_REPAIR_AREA_TOO_LARGE/);
  assert.match(repair, /IMAGE_LOCALIZED_REPAIR_REGION_REQUIRED/);
});

test("localized repair pair review protects unaffected approved pixels", () => {
  assert.match(repair, /unaffected_preservation_score/);
  assert.match(repair, /identity_geometry_preservation_score/);
  assert.match(repair, /camera_composition_preservation_score/);
  assert.match(repair, /unaffected_preservation_score >= 98/);
  assert.match(repair, /Any visible regression outside the declared regions is an automatic FAIL/);
});

test("successful repair supersedes old asset but forces downstream resealing", () => {
  assert.match(repair, /superseded_by_localized_repair_asset_node_id/);
  assert.match(repair, /image_asset_pack_qc_sealed:false/);
  assert.match(repair, /image_multiview_qc_sealed:false/);
  assert.match(repair, /image_asset_derivative_qc_sealed:false/);
  assert.match(handoff, /localized_repair_superseded!==true/);
});

test("queue runs localized repair after image QC", () => {
  assert.match(queue, /CreativeImageAssetLocalizedRepairRuntime/);
  assert.match(queue, /localizedImageRepairs/);
  assert.match(queue, /localizedImageRepairReviews/);
  assert.match(queue, /localizedImageRepairQc/);
});
