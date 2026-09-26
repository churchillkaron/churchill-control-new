import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { applyImageStudioAdjustmentLayers, validateImageStudioAdjustmentMask } from "../lib/creative/stills/runtime/CreativeImageStudioAdjustmentLayerRuntime.js";

test("masked adjustment changes only pixels admitted by its independent mask",()=>{
  const raw=Buffer.from([100,100,100,255, 100,100,100,255]);
  const layers=[{id:"adj",layer_type:"ADJUSTMENT",visible:true,style:{opacity:1,adjustments:{exposure:1}},metadata:{adjustment_target_layer_ids:["img"],adjustment_mask_layer_id:"mask"}}];
  const out=applyImageStudioAdjustmentLayers(raw,2,1,4,layers,{adj:Buffer.from([255,0])});
  assert.ok(out.bytes[0]>100);
  assert.equal(out.bytes[4],100);
  assert.equal(out.bytes[7],255);
});

test("adjustment mask authority rejects wrong image target",()=>{
  const adjustment={id:"adj",metadata:{adjustment_target_layer_ids:["img-1"],adjustment_mask_layer_id:"mask"}};
  const good={id:"mask",layer_type:"MASK",metadata:{clip_mask_target_id:"img-1"}};
  const bad={id:"mask",layer_type:"MASK",metadata:{clip_mask_target_id:"img-2"}};
  assert.equal(validateImageStudioAdjustmentMask(adjustment,good).ready,true);
  const invalid=validateImageStudioAdjustmentMask(adjustment,bad);
  assert.equal(invalid.ready,false);
  assert.ok(invalid.failures.includes("ADJUSTMENT_MASK_TARGET_MISMATCH"));
});

test("deterministic export resolves independent adjustment masks with semantic and brush support",()=>{
  const source=fs.readFileSync("lib/creative/stills/runtime/CreativeImageStudioExportRuntime.js","utf8");
  assert.match(source,/adjustment_mask_layer_id/);
  assert.match(source,/validateImageStudioAdjustmentMask/);
  assert.match(source,/IMAGE_STUDIO_ADJUSTMENT_MASK_INVALID/);
  assert.match(source,/semanticExternalMatteBuffer/);
  assert.match(source,/applyImageStudioBrushMaskRefinements/);
  assert.match(source,/maskAlphaByAdjustmentId/);
  assert.match(source,/CREATIVE_IMAGE_STUDIO_ADJUSTMENT_LAYER_V2/);
});

test("workspace and inspector manage independent adjustment mask lifecycle",()=>{
  const store=fs.readFileSync("components/creative/specialist/useImageStudioWorkspaceStore.js","utf8");
  const inspector=fs.readFileSync("components/creative/specialist/ImageStudioLayerInspector.jsx","utf8");
  assert.match(store,/createAdjustmentMaskFromRegion/);
  assert.match(store,/clearAdjustmentMask/);
  assert.match(store,/adjustment_mask_layer_id/);
  assert.match(inspector,/Adjustment mask/);
  assert.match(inspector,/Create mask from Region/);
  assert.match(inspector,/Edit mask/);
  assert.match(inspector,/Remove mask/);
  assert.match(inspector,/without hiding the base image/);
});


test("adjustment masks support governed semantic selection creation",()=>{
  const store=fs.readFileSync("components/creative/specialist/useImageStudioWorkspaceStore.js","utf8");
  const inspector=fs.readFileSync("components/creative/specialist/ImageStudioLayerInspector.jsx","utf8");
  assert.match(store,/createAdjustmentSemanticMaskFromSelected/);
  assert.match(store,/buildImageStudioSemanticMaskPatch/);
  assert.match(store,/attachImageStudioSemanticMatte/);
  assert.match(inspector,/Subject only/);
  assert.match(inspector,/Background only/);
  assert.match(inspector,/Luminance/);
  assert.match(inspector,/Color range/);
  assert.match(inspector,/createAdjustmentSemanticMaskFromSelected/);
});

test("owned subject/background mask request resolves the adjustment target image rather than the adjustment pseudo-layer",()=>{
  const inspector=fs.readFileSync("components/creative/specialist/ImageStudioLayerInspector.jsx","utf8");
  assert.match(inspector,/semanticTargetLayer=layer\.layer_type==="IMAGE"\?layer:adjustmentTargetLayer/);
  assert.match(inspector,/target_layer_id:semanticTargetLayer\?\.id/);
  assert.match(inspector,/source_asset_id:semanticTargetLayer\?\.source_asset_id/);
});
