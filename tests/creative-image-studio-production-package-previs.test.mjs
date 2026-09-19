import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const previs = fs.readFileSync("lib/creative/image/runtime/CreativeImagePrevisualizationAuthorityRuntime.js", "utf8");
const pack = fs.readFileSync("lib/creative/image/runtime/CreativeImageProductionPackageRuntime.js", "utf8");
const gate = fs.readFileSync("lib/creative/production-graph/runtime/CreativeVisualProductionExecutionGate.js", "utf8");
const dispatch = fs.readFileSync("lib/creative/video/runtime/CreativeVideoProductionDispatchBootstrap.js", "utf8");

test("previs authority validates image production package without provider calls", () => {
  assert.match(previs, /CREATIVE_IMAGE_PREVIS_AUTHORITY_V1/);
  assert.match(previs, /PREVIS_HERO_FRAME_REQUIRED/);
  assert.match(previs, /PREVIS_CHARACTER_MULTIVIEW_REQUIRED/);
  assert.match(previs, /PREVIS_THREAT_MULTIVIEW_REQUIRED/);
  assert.match(previs, /PREVIS_MATERIAL_TRUTH_PACK_REQUIRED/);
  assert.match(previs, /PREVIS_PURSUIT_SPATIAL_CHOREOGRAPHY_REQUIRED/);
  assert.match(previs, /zero_provider_calls:true/);
});

test("final image production package aggregates all visual authority", () => {
  assert.match(pack, /CREATIVE_IMAGE_PRODUCTION_PACKAGE_V1/);
  assert.match(pack, /hero_derivatives/);
  assert.match(pack, /character_multiview_asset_node_ids/);
  assert.match(pack, /threat_multiview_asset_node_ids/);
  assert.match(pack, /material_truth_assets/);
  assert.match(pack, /camera_authority/);
  assert.match(pack, /production_package_digest/);
});

test("visual execution fail-closes on previs and package readiness", () => {
  assert.match(gate, /IMAGE_STUDIO_PREVIS_AUTHORITY_BLOCKED/);
  assert.match(gate, /IMAGE_STUDIO_PRODUCTION_PACKAGE_BLOCKED/);
  assert.match(gate, /image_production_package_bound: true/);
});

test("video dispatch detects stale Image Studio production package", () => {
  assert.match(dispatch, /CreativeImageProductionPackageRuntime/);
  assert.match(dispatch, /IMAGE_STUDIO_PRODUCTION_PACKAGE_STALE_OR_BLOCKED/);
  assert.match(dispatch, /IMAGE_STUDIO_PRODUCTION_PACKAGE_STALE/);
  assert.match(dispatch, /image_production_package_stale_check_passed/);
});
