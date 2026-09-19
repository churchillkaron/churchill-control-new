import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const material = fs.readFileSync("lib/creative/image/runtime/CreativeImageMaterialTruthPackRuntime.js", "utf8");
const authority = fs.readFileSync("lib/creative/image/runtime/CreativeImageAssetAuthorityRuntime.js", "utf8");
const reconcile = fs.readFileSync("lib/creative/image/runtime/CreativeImageAssetReconciliationRuntime.js", "utf8");
const gate = fs.readFileSync("lib/creative/production-graph/runtime/CreativeVisualProductionExecutionGate.js", "utf8");
const premium = fs.readFileSync("lib/creative/vfx/runtime/CreativePremiumLayerTaskMaterializationRuntime.js", "utf8");
const perceptual = fs.readFileSync("lib/creative/quality/runtime/CreativeGeneratedMediaPerceptualExecutionGate.js", "utf8");
const queue = fs.readFileSync("lib/creative/production/queue/runtime/ProductionQueueRuntime.js", "utf8");

test("Image Studio material truth pack covers physical surface classes", () => {
  assert.match(authority, /MATERIAL_DETAIL_REFERENCE/);
  assert.match(material, /WET_SKIN/);
  assert.match(material, /WET_FABRIC/);
  assert.match(material, /WET_BARK/);
  assert.match(material, /WET_MUD_GROUND/);
  assert.match(material, /WET_METAL/);
  assert.match(material, /WET_GLASS/);
  assert.match(material, /SEARCHLIGHT_ATMOSPHERE_INTERACTION/);
});

test("material reference generation is provider-neutral governed image production", () => {
  assert.match(material, /service_id:"ai\.image\.generate"/);
  assert.match(material, /provider_id:null/);
  assert.match(material, /physical_surface_authority:true/);
  assert.match(material, /downstream_material_reinvention_forbidden:true/);
  assert.match(reconcile, /material_truth_key/);
});

test("material truth has hard physical QC", () => {
  assert.match(material, /material_truth_score >= 95/);
  assert.match(material, /tactile_realism_score >= 95/);
  assert.match(material, /cross_material_separation_score >= 95/);
  assert.match(material, /anti_ai_texture_score >= 96/);
  assert.match(material, /Wetness must follow gravity, contact, porosity and surface tension/);
  assert.match(perceptual, /MATERIAL_DETAIL_REFERENCE/);
  assert.match(perceptual, /plastic skin/);
});

test("video execution binds material truth pack and fails closed when required", () => {
  assert.match(gate, /CreativeImageMaterialTruthPackRuntime/);
  assert.match(gate, /IMAGE_STUDIO_MATERIAL_TRUTH_PACK_REQUIRED/);
  assert.match(gate, /IMAGE_STUDIO_MATERIAL_TRUTH_/);
  assert.match(gate, /material_truth_pack_qc_seal_hash/);
});

test("premium VFX shares the same material truth authority", () => {
  assert.match(premium, /CreativeImageMaterialTruthPackRuntime/);
  assert.match(premium, /IMAGE_STUDIO_MATERIAL_TRUTH_PACK_REQUIRED/);
  assert.match(premium, /material_truth_assets/);
  assert.match(premium, /material_truth_asset_node_ids/);
});

test("production queue runs material truth generation and QC", () => {
  assert.match(queue, /CreativeImageMaterialTruthPackRuntime/);
  assert.match(queue, /materialTruthReferences/);
  assert.match(queue, /materialTruthReviews/);
  assert.match(queue, /materialTruthQc/);
});
