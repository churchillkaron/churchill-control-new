import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildImageStudioGrainPixels, normalizeImageStudioTextureIntegration } from "../lib/creative/stills/runtime/CreativeImageStudioTextureCoreRuntime.js";
import { buildImageStudioGrainTile } from "../lib/creative/stills/runtime/CreativeImageStudioTextureIntegrationRuntime.js";

test("browser-safe grain core is byte-identical to server export tile",()=>{
  const style={texture_integration:{grain_amount:.2,grain_seed:42,grain_size:2,grain_monochrome:false}};
  const core=buildImageStudioGrainPixels(style,64);
  const server=buildImageStudioGrainTile(style,64);
  assert.deepEqual([...core.pixels],[...server.bytes]);
  assert.equal(core.width,server.width);
  assert.equal(core.height,server.height);
});

test("texture normalization remains shared across browser and export",()=>{
  const settings=normalizeImageStudioTextureIntegration({texture_integration:{sharpen_sigma:9,grain_amount:.9,grain_size:99,bloom_strength:4,bloom_radius_px:999,bloom_threshold:-2}});
  assert.deepEqual(settings,{
    sharpen_sigma:5,
    grain_amount:.35,
    grain_size:6,
    grain_seed:1337,
    grain_monochrome:true,
    bloom_strength:1,
    bloom_radius_px:120,
    bloom_threshold:0,
  });
});

test("browser-safe texture core does not depend on Node Buffer",()=>{
  const source=fs.readFileSync("lib/creative/stills/runtime/CreativeImageStudioTextureCoreRuntime.js","utf8");
  assert.doesNotMatch(source,/\bBuffer\b/);
  assert.match(source,/Uint8ClampedArray/);
  assert.match(source,/xorshift32/);
});

test("canvas previews the full deterministic export grain tile at artboard scale",()=>{
  const overlay=fs.readFileSync("components/creative/specialist/ImageStudioTexturePreviewOverlay.jsx","utf8");
  const canvas=fs.readFileSync("components/creative/specialist/ImageStudioCanvasSurface.jsx","utf8");
  assert.match(overlay,/const TILE_SIZE=1024/);
  assert.match(overlay,/buildImageStudioGrainPixels/);
  assert.match(overlay,/mixBlendMode:"overlay"/);
  assert.match(overlay,/TILE_SIZE\*Math\.max\(\.0001,Number\(scale\)\|\|1\)/);
  assert.match(canvas,/ImageStudioTexturePreviewOverlay/);
});

test("non-browser-exact finishing is explicitly marked export authoritative",()=>{
  const source=fs.readFileSync("components/creative/specialist/ImageStudioTexturePreviewOverlay.jsx","utf8");
  assert.match(source,/settings\.sharpen_sigma>0\|\|settings\.bloom_strength>0/);
  assert.match(source,/Bloom \/ sharpen · export authoritative/);
  assert.match(source,/data-texture-export-authoritative/);
});
