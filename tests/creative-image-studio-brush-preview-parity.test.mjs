import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { imageStudioBrushFeatherSigma, imageStudioBrushStrokeSvg } from "../lib/creative/stills/runtime/CreativeImageStudioBrushMaskRuntime.js";

test("brush feather sigma is shared and bounded",()=>{
  assert.equal(imageStudioBrushFeatherSigma({size_px:100,hardness:1}),0);
  assert.equal(imageStudioBrushFeatherSigma({size_px:100,hardness:.5}),22.5);
  assert.equal(imageStudioBrushFeatherSigma({size_px:999,hardness:-1}),225);
});

test("export SVG consumes the shared feather sigma",()=>{
  const svg=imageStudioBrushStrokeSvg({mode:"ADD",points:[{x:.2,y:.2},{x:.8,y:.8}],size_px:100,hardness:.5,opacity:1},{x:0,y:0,width:100,height:100},100,100);
  assert.match(svg,/feGaussianBlur stdDeviation="22.5"/);
  assert.match(svg,/filter="url\(#soft\)"/);
});

test("live mask brush preview carries draft hardness and renders the same Gaussian feather",()=>{
  const source=fs.readFileSync("components/creative/specialist/ImageStudioMaskBrushOverlay.jsx","utf8");
  assert.match(source,/imageStudioBrushFeatherSigma/);
  assert.match(source,/hardness:workspace\.ui\.mask_brush_hardness\?\?\.8/);
  assert.match(source,/<feGaussianBlur stdDeviation=\{blur\}/);
  assert.match(source,/filter=\{blur>0\?/);
});

test("hard brush preview remains unfiltered",()=>{
  assert.equal(imageStudioBrushFeatherSigma({size_px:40,hardness:1}),0);
});
