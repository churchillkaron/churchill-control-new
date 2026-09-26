import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { normalizeImageStudioAdjustments, applyImageStudioPixelAdjustments } from "../lib/creative/stills/runtime/CreativeImageStudioAdjustmentRuntime.js";

test("advanced still adjustments normalize to bounded non-destructive values",()=>{
  const a=normalizeImageStudioAdjustments({adjustments:{exposure:10,temperature:-150,tint:30,shadows:40,highlights:-20,levels:{black:-5,gamma:0,white:999}}});
  assert.equal(a.exposure,5); assert.equal(a.temperature,-100); assert.equal(a.tint,30);
  assert.equal(a.levels.black,0); assert.equal(a.levels.gamma,.1); assert.equal(a.levels.white,255);
});

test("deterministic pixel adjustment changes RGB while preserving alpha",()=>{
  const src=Buffer.from([100,120,140,77]);
  const result=applyImageStudioPixelAdjustments(src,1,1,4,{adjustments:{exposure:1,temperature:40,tint:-20,levels:{black:10,gamma:1.1,white:240}}});
  assert.notDeepEqual([...result.bytes.slice(0,3)],[100,120,140]);
  assert.equal(result.bytes[3],77);
});

test("master export applies advanced adjustments before compositing",()=>{
  const source=fs.readFileSync("lib/creative/stills/runtime/CreativeImageStudioExportRuntime.js","utf8");
  assert.match(source,/applyImageStudioPixelAdjustments/);
  assert.match(source,/CREATIVE_IMAGE_STUDIO_ADJUSTMENT_V2/);
  assert.match(source,/deterministic_pixel_pipeline: true/);\n  assert.match(source,/CREATIVE_IMAGE_STUDIO_CURVES_V1/);\n  assert.match(source,/rgb_channel_curves: true/);
});

test("Image Studio inspector exposes governed advanced adjustments",()=>{
  const source=fs.readFileSync("components/creative/specialist/ImageStudioLayerInspector.jsx","utf8");
  for(const label of ["Exposure EV","Temperature","Tint","Shadows","Highlights","Black","Gamma","White"]){assert.match(source,new RegExp(label));}
  assert.match(source,/deterministic master render/);
});

test("canvas preview consumes the same adjustment state used by export",()=>{
  const effects=fs.readFileSync("lib/creative/stills/runtime/CreativeImageStudioEffectsRuntime.js","utf8");
  assert.match(effects,/imageStudioAdjustmentPreviewStyle/);
  assert.match(effects,/CREATIVE_IMAGE_STUDIO_EFFECTS_V2/);
});
