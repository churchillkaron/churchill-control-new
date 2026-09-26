import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { normalizeImageStudioTextureIntegration, buildImageStudioGrainTile } from "../lib/creative/stills/runtime/CreativeImageStudioTextureIntegrationRuntime.js";

test("texture integration values are production bounded",()=>{
  const t=normalizeImageStudioTextureIntegration({texture_integration:{sharpen_sigma:99,grain_amount:1,grain_size:20,bloom_strength:2,bloom_radius_px:999,bloom_threshold:-1}});
  assert.equal(t.sharpen_sigma,5);
  assert.equal(t.grain_amount,.35);
  assert.equal(t.grain_size,6);
  assert.equal(t.bloom_strength,1);
  assert.equal(t.bloom_radius_px,120);
  assert.equal(t.bloom_threshold,0);
});

test("grain generation is deterministic for exact finishing lineage",()=>{
  const style={texture_integration:{grain_amount:.2,grain_seed:42,grain_size:2}};
  const a=buildImageStudioGrainTile(style,64);
  const b=buildImageStudioGrainTile(style,64);
  assert.deepEqual(a.bytes,b.bytes);
  const c=buildImageStudioGrainTile({texture_integration:{grain_amount:.2,grain_seed:43,grain_size:2}},64);
  assert.notDeepEqual(a.bytes,c.bytes);
});

test("export applies texture finishing after grading",()=>{
  const source=fs.readFileSync("lib/creative/stills/runtime/CreativeImageStudioExportRuntime.js","utf8");
  assert.match(source,/applyImageStudioTextureFinishing/);
  assert.match(source,/buildImageStudioGrainTile/);
  assert.match(source,/CREATIVE_IMAGE_STUDIO_TEXTURE_INTEGRATION_V1/);
  const adjustmentIndex=source.indexOf("applyImageStudioAdjustmentLayers");
  const textureIndex=source.lastIndexOf("applyImageStudioTextureFinishing");
  assert.ok(textureIndex>adjustmentIndex);
});

test("inspector exposes optical finishing controls",()=>{
  const source=fs.readFileSync("components/creative/specialist/ImageStudioLayerInspector.jsx","utf8");
  for(const label of ["Final sharpen","Grain amount %","Grain size","Bloom strength %","Bloom radius px","Bloom threshold %"])assert.match(source,new RegExp(label));
  assert.match(source,/Monochrome grain/);
});
