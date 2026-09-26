import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { normalizeImageStudioTextureIntegration, buildImageStudioGrainTile, restoreImageStudioTextureAlphaAuthority } from "../lib/creative/stills/runtime/CreativeImageStudioTextureIntegrationRuntime.js";

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

test("grain finishing preserves authoritative alpha and hidden RGB",()=>{
  const base=Buffer.from([
    20,30,40,0,
    80,90,100,128,
    120,130,140,255,
  ]);
  const transformed=Buffer.from([
    200,210,220,64,
    100,110,120,200,
    130,140,150,180,
  ]);
  const out=restoreImageStudioTextureAlphaAuthority(base,transformed,3,1,4);
  assert.deepEqual([...out.bytes.slice(0,4)],[20,30,40,0]);
  assert.deepEqual([...out.bytes.slice(4,8)],[100,110,120,128]);
  assert.deepEqual([...out.bytes.slice(8,12)],[130,140,150,255]);
  assert.equal(out.transparent_pixel_count,1);
  assert.equal(out.alpha_preserved,true);
});

test("texture alpha authority fails deterministically on malformed buffers",()=>{
  assert.throws(()=>restoreImageStudioTextureAlphaAuthority(Buffer.alloc(4),Buffer.alloc(8),1,1,4),/IMAGE_STUDIO_TEXTURE_ALPHA_BUFFER_SIZE_MISMATCH/);
  assert.throws(()=>restoreImageStudioTextureAlphaAuthority(Buffer.alloc(3),Buffer.alloc(3),1,1,3),/IMAGE_STUDIO_TEXTURE_ALPHA_CHANNEL_REQUIRED/);
});

test("export restores alpha authority after grain overlay",()=>{
  const source=fs.readFileSync("lib/creative/stills/runtime/CreativeImageStudioExportRuntime.js","utf8");
  const grainComposite=source.indexOf('blend:"overlay"');
  const restore=source.indexOf("restoreImageStudioTextureAlphaAuthority",grainComposite);
  assert.ok(grainComposite>=0&&restore>grainComposite);
  assert.match(source,/const alphaAuthority=await sharp\(rendered\)\.ensureAlpha\(\)\.raw\(\)/);
});
