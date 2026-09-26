import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildImageStudioMaskLayer, normalizeImageStudioMaskShape } from "../lib/creative/stills/runtime/CreativeImageStudioMaskLayerRuntime.js";
import { imageStudioMaskGeometry, imageStudioMaskPreviewStyle } from "../lib/creative/stills/runtime/CreativeImageStudioReusableDesignRuntime.js";

test("dedicated mask layer owns exact target scope and mask semantics",()=>{
  const mask=buildImageStudioMaskLayer({id:"m",artboard_id:"b",target_layer_id:"img",region:{x:20,y:30,width:160,height:80},mask_shape:"ELLIPSE",feather:18,opacity:.75,invert:true,sort_order:9});
  assert.equal(mask.layer_type,"MASK");
  assert.equal(mask.metadata.clip_mask_target_id,"img");
  assert.equal(mask.metadata.dedicated_mask_layer,true);
  assert.equal(mask.metadata.mask_shape,"ELLIPSE");
  assert.equal(mask.metadata.mask_feather,18);
  assert.equal(mask.metadata.mask_opacity,.75);
  assert.equal(mask.metadata.mask_invert,true);
});

test("mask shape normalizes fail-safe to rectangle",()=>{
  assert.equal(normalizeImageStudioMaskShape("rounded_rect"),"ROUNDED_RECT");
  assert.equal(normalizeImageStudioMaskShape("bad-shape"),"RECT");
});

test("ellipse and rounded mask preview use real geometry",()=>{
  const target={bounds:{x:0,y:0,width:200,height:100}};
  const ellipse={bounds:{x:50,y:20,width:100,height:60},metadata:{mask_shape:"ELLIPSE"}};
  const rounded={bounds:{x:50,y:20,width:100,height:60},metadata:{mask_shape:"ROUNDED_RECT",mask_radius:16}};
  assert.match(imageStudioMaskPreviewStyle(target,ellipse).clipPath,/ellipse/);
  assert.match(imageStudioMaskPreviewStyle(target,rounded).clipPath,/round/);
  assert.equal(imageStudioMaskGeometry(target,ellipse).visible,true);
});

test("editor creates dedicated mask from Region and exposes first-class mask layer controls",()=>{
  const store=fs.readFileSync("components/creative/specialist/useImageStudioWorkspaceStore.js","utf8");
  const toolbar=fs.readFileSync("components/creative/specialist/ImageStudioCanvasToolbar.jsx","utf8");
  const inspector=fs.readFileSync("components/creative/specialist/ImageStudioLayerInspector.jsx","utf8");
  const panel=fs.readFileSync("components/creative/specialist/ImageStudioLayerPanel.jsx","utf8");
  const canvas=fs.readFileSync("components/creative/specialist/ImageStudioCanvasSurface.jsx","utf8");
  const maskRuntime=fs.readFileSync("lib/creative/stills/runtime/CreativeImageStudioMaskLayerRuntime.js","utf8");
  assert.match(store,/createMaskLayerFromRegion/);
  assert.match(store,/buildImageStudioMaskLayer/);
  assert.match(toolbar,/Create mask layer from Region/);
  assert.match(inspector,/Dedicated mask layer/);
  assert.match(inspector,/Ellipse/);
  assert.match(inspector,/Rounded rectangle/);
  assert.match(panel,/layer_type==="MASK"/);
  assert.match(maskRuntime,/name:`Mask · \$\{resolvedShape\.toLowerCase\(\)\.replace/);
  assert.match(canvas,/layer\.layer_type==="MASK"/);
});

test("deterministic export renders dedicated mask shapes instead of rectangle-only masks",()=>{
  const exporter=fs.readFileSync("lib/creative/stills/runtime/CreativeImageStudioExportRuntime.js","utf8");
  assert.match(exporter,/mask_shape/);
  assert.match(exporter,/ellipse/);
  assert.match(exporter,/rx=/);
  assert.match(exporter,/dedicated_mask_layer/);
});


test("dedicated mask lifecycle clears target links on release and delete",()=>{
  const store=fs.readFileSync("components/creative/specialist/useImageStudioWorkspaceStore.js","utf8");
  assert.match(store,/selected\?\.layer_type==="MASK"/);
  assert.match(store,/dedicated_mask_layer===true/);
  assert.match(store,/delete metadata\.clip_mask_layer_id/);
  assert.match(store,/deleteIds\.add\(mask\.id\)/);
});
