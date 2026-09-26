import test from "node:test";
import assert from "node:assert/strict";
import { buildImageStudioBrushStroke, imageStudioBrushStrokeSvg } from "../lib/creative/stills/runtime/CreativeImageStudioBrushMaskRuntime.js";

test("brush mask stroke is normalized and non-destructive",()=>{
  const stroke=buildImageStudioBrushStroke({mode:"ADD",points:[{x:-1,y:.5},{x:2,y:1.5}],size_px:700,hardness:2,opacity:2});
  assert.equal(stroke.mode,"ADD");
  assert.deepEqual(stroke.points,[{x:0,y:.5},{x:1,y:1}]);
  assert.equal(stroke.size_px,500);
  assert.equal(stroke.hardness,1);
  assert.equal(stroke.opacity,1);
  assert.equal(stroke.non_destructive,true);
});

test("brush mask rejects unsupported mode and missing points",()=>{
  assert.throws(()=>buildImageStudioBrushStroke({mode:"BAD",points:[{x:.5,y:.5}]}),/MODE_UNSUPPORTED/);
  assert.throws(()=>buildImageStudioBrushStroke({mode:"ADD",points:[]}),/POINTS_REQUIRED/);
});

test("brush stroke SVG maps normalized points into mask region with feathered hardness",()=>{
  const svg=imageStudioBrushStrokeSvg({mode:"ADD",points:[{x:0,y:0},{x:1,y:1}],size_px:20,hardness:.5,opacity:.7},{x:10,y:20,width:100,height:50},200,100);
  assert.match(svg,/M 10 20 L 110 70/);
  assert.match(svg,/stroke-width="20"/);
  assert.match(svg,/opacity="0.7"/);
  assert.match(svg,/feGaussianBlur/);
});


test("editor stores brush refinements on selected MASK layer and exposes controls", async()=>{
  const fs=await import("node:fs");
  const store=fs.readFileSync("components/creative/specialist/useImageStudioWorkspaceStore.js","utf8");
  const inspector=fs.readFileSync("components/creative/specialist/ImageStudioLayerInspector.jsx","utf8");
  const toolbar=fs.readFileSync("components/creative/specialist/ImageStudioCanvasToolbar.jsx","utf8");
  const overlay=fs.readFileSync("components/creative/specialist/ImageStudioMaskBrushOverlay.jsx","utf8");
  assert.match(store,/addMaskBrushStroke/);
  assert.match(store,/mask_brush_strokes/);
  assert.match(store,/clearMaskBrushStrokes/);
  assert.match(inspector,/Precision brush refinement/);
  assert.match(inspector,/Add brush/);
  assert.match(inspector,/Subtract brush/);
  assert.match(inspector,/Hardness %/);
  assert.match(toolbar,/mask_brush/);
  assert.match(toolbar,/layer_type==="MASK"/);
  assert.match(overlay,/workspace\.addMaskBrushStroke/);
  assert.match(overlay,/touch-none cursor-crosshair/);
});

test("master export refines base geometric or semantic masks instead of replacing authority", async()=>{
  const fs=await import("node:fs");
  const exporter=fs.readFileSync("lib/creative/stills/runtime/CreativeImageStudioExportRuntime.js","utf8");
  assert.match(exporter,/applyImageStudioBrushMaskRefinements/);
  assert.match(exporter,/normalizeImageStudioBrushStrokes/);
  assert.match(exporter,/alpha\+\(255-alpha\)\*strength/);
  assert.match(exporter,/alpha\*\(1-strength\)/);
  assert.match(exporter,/brush_refinement_contract:"CREATIVE_IMAGE_STUDIO_BRUSH_MASK_V1"/);
});
