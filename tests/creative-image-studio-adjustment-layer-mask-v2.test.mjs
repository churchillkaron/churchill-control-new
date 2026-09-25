import test from "node:test";
import assert from "node:assert/strict";
import { buildImageStudioAdjustmentLayer, adjustmentLayersForTarget, applyImageStudioAdjustmentLayers } from "../lib/creative/stills/runtime/CreativeImageStudioAdjustmentLayerRuntime.js";
import { imageStudioMaskGeometry, imageStudioMaskPreviewStyle } from "../lib/creative/stills/runtime/CreativeImageStudioReusableDesignRuntime.js";

test("adjustment layer has explicit governed target scope",()=>{
  const layer=buildImageStudioAdjustmentLayer({id:"a",artboard_id:"board",target_layer_ids:["img-1","img-1","img-2"],sort_order:9});
  assert.equal(layer.layer_type,"ADJUSTMENT");
  assert.deepEqual(layer.metadata.adjustment_target_layer_ids,["img-1","img-2"]);
  assert.equal(layer.metadata.adjustment_scope,"EXPLICIT_TARGETS");
});

test("adjustment layers resolve by explicit target and apply with layer opacity",()=>{
  const layers=[{id:"a",layer_type:"ADJUSTMENT",visible:true,sort_order:2,metadata:{adjustment_target_layer_ids:["img"]},style:{opacity:.5,adjustments:{exposure:1}}}];
  assert.equal(adjustmentLayersForTarget(layers,"img").length,1);
  assert.equal(adjustmentLayersForTarget(layers,"other").length,0);
  const raw=Buffer.from([100,100,100,55]);
  const out=applyImageStudioAdjustmentLayers(raw,1,1,4,layers);
  assert.ok(out.bytes[0]>100&&out.bytes[0]<200);
  assert.equal(out.bytes[3],55);
});

test("mask v2 carries feather invert and opacity semantics",()=>{
  const target={bounds:{x:0,y:0,width:200,height:100}};
  const mask={bounds:{x:50,y:20,width:100,height:60},metadata:{mask_feather:24,mask_opacity:.7,mask_invert:true}};
  const g=imageStudioMaskGeometry(target,mask);
  assert.equal(g.feather,24); assert.equal(g.opacity,.7); assert.equal(g.invert,true);
  const preview=imageStudioMaskPreviewStyle(target,mask);
  assert.equal(preview.opacity,.7); assert.match(preview.outline,/dashed/);
});

test("Image Studio UI creates and edits explicit-target adjustment layers", async()=>{
  const fs=await import("node:fs");
  const store=fs.readFileSync("components/creative/specialist/useImageStudioWorkspaceStore.js","utf8");
  const toolbar=fs.readFileSync("components/creative/specialist/ImageStudioCanvasToolbar.jsx","utf8");
  const panel=fs.readFileSync("components/creative/specialist/ImageStudioLayerPanel.jsx","utf8");
  const inspector=fs.readFileSync("components/creative/specialist/ImageStudioLayerInspector.jsx","utf8");
  assert.match(store,/createAdjustmentLayerFromSelected/);
  assert.match(toolbar,/Create adjustment layer for selected image layers/);
  assert.match(panel,/layer_type==="ADJUSTMENT"/);
  assert.match(inspector,/Adjustment opacity %/);
  assert.match(inspector,/explicit image layer/);
});

test("Image Studio inspector exposes Mask V2 feather opacity and inversion", async()=>{
  const fs=await import("node:fs");
  const inspector=fs.readFileSync("components/creative/specialist/ImageStudioLayerInspector.jsx","utf8");
  const store=fs.readFileSync("components/creative/specialist/useImageStudioWorkspaceStore.js","utf8");
  assert.match(inspector,/Feather px/);
  assert.match(inspector,/Mask opacity %/);
  assert.match(inspector,/Invert mask/);
  assert.match(store,/updateSelectedMaskSemantics/);
});
