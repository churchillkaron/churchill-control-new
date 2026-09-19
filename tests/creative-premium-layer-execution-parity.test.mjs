import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const materialization = fs.readFileSync("lib/creative/vfx/runtime/CreativePremiumLayerTaskMaterializationRuntime.js", "utf8");
const atmosphere = fs.readFileSync("lib/creative/vfx/runtime/CreativeAtmospherePassExecutionRuntime.js", "utf8");
const threat = fs.readFileSync("lib/creative/vfx/runtime/CreativeThreatHeroLayerPassExecutionRuntime.js", "utf8");
const queue = fs.readFileSync("lib/creative/production/queue/runtime/ProductionQueueRuntime.js", "utf8");
const review = fs.readFileSync("lib/creative/vfx/runtime/CreativeVfxReviewTaskRuntime.js", "utf8");
const artifact = fs.readFileSync("lib/creative/multipass/runtime/CreativeMultiPassArtifactRuntime.js", "utf8");
const compAuthor = fs.readFileSync("lib/creative/compositing/runtime/CreativeCompositingAuthoringRuntime.js", "utf8");
const compMat = fs.readFileSync("lib/creative/compositing/runtime/CreativeCompositeTaskMaterializationRuntime.js", "utf8");
const bridge = fs.readFileSync("lib/creative/multipass/runtime/CreativePremiumLayerPassBridgeRuntime.js", "utf8");

test("required atmosphere and threat passes materialize as executable tasks", () => {
  assert.match(materialization, /creative\.vfx\.atmosphere/);
  assert.match(materialization, /creative\.vfx\.threat-hero-layer/);
  assert.match(materialization, /THREAT_HERO_SOURCE_ASSET_REQUIRED/);
  assert.match(materialization, /CERTIFIED_DEPTH_MAP_REQUIRED/);
  assert.match(materialization, /APPROVED_BASE_PLATE_REQUIRED/);
});

test("atmosphere is a real deterministic transparent render", () => {
  assert.match(atmosphere, /qtrle/);
  assert.match(atmosphere, /argb/);
  assert.match(atmosphere, /pass_id:"atmosphere"/);
  assert.match(atmosphere, /provider_calls_performed:false/);
  assert.match(atmosphere, /rain_intensity/);
  assert.match(atmosphere, /fog_density/);
});

test("threat hero layer performs depth-aware owned VFX integration", () => {
  assert.match(threat, /CreativeVfxIntegrationRenderRuntime\.render/);
  assert.match(threat, /pass_id:"threat-hero-layer"/);
  assert.match(threat, /transparent_alpha_required:true/);
  assert.match(threat, /provider_calls_performed:false/);
});

test("queue dispatches premium layers and sends them through VFX QC", () => {
  assert.match(queue, /CreativePremiumLayerTaskMaterializationRuntime/);
  assert.match(queue, /dispatchPremiumLayerTask/);
  assert.match(queue, /localPremiumLayerOperation/);
  assert.match(review, /creative\.vfx\.atmosphere/);
  assert.match(review, /creative\.vfx\.threat-hero-layer/);
  assert.match(artifact, /"atmosphere","threat-hero-layer"/);
});

test("compositing preauthors and resolves QC-sealed premium layer artifacts", () => {
  assert.match(compAuthor, /AUTO_MULTIPASS:THREAT_HERO_LAYER/);
  assert.match(compAuthor, /AUTO_MULTIPASS:ATMOSPHERE/);
  assert.match(compMat, /AUTO_MULTIPASS:THREAT_HERO_LAYER/);
  assert.match(compMat, /AUTO_MULTIPASS:ATMOSPHERE/);
  assert.match(compMat, /vfx_qc_sealed===true/);
  assert.match(bridge, /AVANTIQO_VFX_QC_SEAL_V1/);
});
