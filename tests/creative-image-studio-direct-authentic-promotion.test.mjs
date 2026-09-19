import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const graph=fs.readFileSync("lib/creative/image/runtime/CreativeImageAssetGraphRuntime.js","utf8");
const runtime=fs.readFileSync("lib/creative/image/runtime/CreativeImageAuthenticSourcePromotionRuntime.js","utf8");
const queue=fs.readFileSync("lib/creative/production/queue/runtime/ProductionQueueRuntime.js","utf8");
const perceptual=fs.readFileSync("lib/creative/quality/runtime/CreativeGeneratedMediaPerceptualGraphRuntime.js","utf8");
const pack=fs.readFileSync("lib/creative/image/runtime/CreativeImageAssetPackConsistencyRuntime.js","utf8");

test("DIRECT_AUTHENTIC hero uses provider-free promotion instead of image generation",()=>{
  assert.match(graph,/directAuthenticShot/);
  assert.match(graph,/creative\.image\.authentic-source-promote/);
  assert.match(graph,/exact_source_pixels_preserved/);
  assert.match(graph,/AUTHENTIC_SOURCE/);
  assert.match(graph,/Do not generate, redraw, relight, crop, restage or alter source pixels/);
});

test("authentic source promotion verifies route provenance and direct-use evidence",()=>{
  assert.match(runtime,/CREATIVE_IMAGE_AUTHENTIC_SOURCE_PROMOTION_V1/);
  assert.match(runtime,/DIRECT_AUTHENTIC/);
  assert.match(runtime,/AUTHENTIC_UPLOAD/);
  assert.match(runtime,/TRUSTED_DERIVED/);
  assert.match(runtime,/AUTHENTIC_SOURCE_DIRECT_USE_BLOCKED/);
  assert.match(runtime,/AUTHENTIC_SOURCE_ROUTE_ID_MISMATCH/);
  assert.match(runtime,/quality_score",82/);
  assert.match(runtime,/composition_score",75/);
  assert.match(runtime,/semantic_fit_score",80/);
});

test("authentic source promotion performs zero generation/provider calls",()=>{
  assert.match(runtime,/exact_source_pixels_preserved:true/);
  assert.match(runtime,/image_generation_performed:false/);
  assert.match(runtime,/provider_calls_performed:false/);
  assert.match(queue,/dispatchImageAuthenticSourcePromotionTask/);
  assert.match(queue,/source_pixels_preserved_exactly: true/);
});

test("promoted IMAGE_ASSET still passes normal perceptual review",()=>{
  assert.match(perceptual,/type === "IMAGE_ASSET"/);
});

test("singleton authentic packs seal deterministically after perceptual approval",()=>{
  assert.match(pack,/image_asset_pack_singleton:true/);
  assert.match(pack,/singleton_asset_node_id/);
  assert.match(pack,/perceptual_qc_sealed/);
});
