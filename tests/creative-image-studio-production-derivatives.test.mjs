import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const factory = fs.readFileSync("lib/creative/image/runtime/CreativeImageAssetDerivativeFactoryRuntime.js", "utf8");
const execution = fs.readFileSync("lib/creative/image/runtime/CreativeImageAssetDerivativeExecutionRuntime.js", "utf8");
const artifact = fs.readFileSync("lib/creative/image/runtime/CreativeImageAssetDerivativeArtifactRuntime.js", "utf8");
const reconcile = fs.readFileSync("lib/creative/image/runtime/CreativeImageAssetDerivativeReconciliationRuntime.js", "utf8");
const qc = fs.readFileSync("lib/creative/image/runtime/CreativeImageAssetDerivativeQcRuntime.js", "utf8");
const bundle = fs.readFileSync("lib/creative/image/runtime/CreativeImageAssetBundleHandoffRuntime.js", "utf8");
const queue = fs.readFileSync("lib/creative/production/queue/runtime/ProductionQueueRuntime.js", "utf8");
const premium = fs.readFileSync("lib/creative/vfx/runtime/CreativePremiumLayerTaskMaterializationRuntime.js", "utf8");

test("selected Image Studio assets materialize production derivatives", () => {
  assert.match(factory, /SUBJECT_SEGMENTATION/);
  assert.match(factory, /ALPHA_MATTE/);
  assert.match(factory, /DEPTH_MAP/);
  assert.match(factory, /UPSCALED_MASTER/);
  assert.match(factory, /image_asset_pack_qc_sealed===true/);
  assert.match(factory, /image_asset_exploration_selected===true/);
});

test("segmentation produces foreground and background masks locally", () => {
  assert.match(execution, /IMAGE_SEGMENTATION/);
  assert.match(execution, /FOREGROUND_MASK/);
  assert.match(execution, /BACKGROUND_MASK/);
  assert.match(execution, /provider_calls_performed:false/);
  assert.match(artifact, /parent_image_asset_node_id/);
  assert.match(artifact, /continuity_group_id/);
});

test("service derivatives preserve parent lineage and require QC", () => {
  assert.match(reconcile, /parent_image_asset_pack_qc_seal_hash/);
  assert.match(reconcile, /parent_image_asset_exploration_selection_seal_hash/);
  assert.match(reconcile, /image_asset_derivative_qc_sealed:false/);
  assert.match(qc, /invented detail/);
  assert.match(qc, /metric depth claims are forbidden/);
  assert.match(qc, /Minimum quality_score: 94/);
});

test("bundle handoff exposes only QC sealed derivatives", () => {
  assert.match(bundle, /image_asset_derivative_qc_sealed===true/);
  assert.match(bundle, /ready_for_vfx/);
  assert.match(bundle, /alpha_matte/);
  assert.match(bundle, /depth_map/);
  assert.match(bundle, /upscaled_master/);
});

test("queue executes derivative factory and local segmentation", () => {
  assert.match(queue, /CreativeImageAssetDerivativeFactoryRuntime/);
  assert.match(queue, /CreativeImageAssetDerivativeExecutionRuntime/);
  assert.match(queue, /dispatchImageDerivativeTask/);
  assert.match(queue, /CreativeImageAssetDerivativeQcRuntime/);
});

test("threat hero VFX refuses raw source without derivative bundle", () => {
  assert.match(premium, /CreativeImageAssetBundleHandoffRuntime/);
  assert.match(premium, /IMAGE_STUDIO_VFX_DERIVATIVE_BUNDLE_REQUIRED/);
  assert.match(premium, /alpha_matte_asset_node_id/);
  assert.match(premium, /segmentation_asset_node_id/);
  assert.match(premium, /upscaled_master_asset_node_id/);
});
