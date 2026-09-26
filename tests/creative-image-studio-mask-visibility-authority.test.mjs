import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { imageStudioAdjustmentPreviewDescriptors } from "../lib/creative/stills/runtime/CreativeImageStudioAdjustmentPreviewRuntime.js";

const target={id:"img",artboard_id:"board",layer_type:"IMAGE",bounds:{x:0,y:0,width:200,height:100}};

test("hidden adjustment mask removes local restriction but keeps the adjustment active",()=>{
  const adjustment={id:"adj",artboard_id:"board",layer_type:"ADJUSTMENT",visible:true,sort_order:2,metadata:{adjustment_target_layer_ids:["img"],adjustment_mask_layer_id:"mask"},style:{opacity:.7,adjustments:{exposure:1}}};
  const mask={id:"mask",artboard_id:"board",layer_type:"MASK",visible:false,metadata:{clip_mask_target_id:"img",adjustment_mask_owner_id:"adj"}};
  const [preview]=imageStudioAdjustmentPreviewDescriptors([target,adjustment,mask],target);
  assert.equal(preview.preview_supported,true);
  assert.equal(preview.mask_hidden,true);
  assert.equal(preview.fidelity,"APPROXIMATE_COLOR_FULL_SCOPE");
  assert.deepEqual(preview.mask_style,{});
  assert.equal(preview.opacity,.7);
});

test("canvas and version compare ignore hidden clip masks",()=>{
  const canvas=fs.readFileSync("components/creative/specialist/ImageStudioCanvasSurface.jsx","utf8");
  const compare=fs.readFileSync("components/creative/specialist/ImageStudioVersionCompare.jsx","utf8");
  assert.match(canvas,/item\.id===layer\.metadata\.clip_mask_layer_id&&item\.visible!==false/);
  assert.match(compare,/item\.id===layer\.metadata\.clip_mask_layer_id&&item\.visible!==false/);
});

test("deterministic export disables hidden clip and adjustment masks",()=>{
  const source=fs.readFileSync("lib/creative/stills/runtime/CreativeImageStudioExportRuntime.js","utf8");
  assert.match(source,/if \(clipMaskLayer\?\.visible!==false && clipMaskLayer\)/);
  assert.match(source,/if\(adjustmentMaskLayer\?\.visible===false\)continue/);
});

test("hidden review-required masks do not block export while visible masks remain gated",()=>{
  const source=fs.readFileSync("lib/creative/stills/runtime/CreativeImageStudioExportRuntime.js","utf8");
  assert.match(source,/unapprovedSemanticMattes=layers\.filter\(\(layer\)=>\s*layer\.visible!==false && layer\.layer_type==="MASK"/);
  assert.match(source,/unapprovedSmartMasks=layers\.filter\(\(layer\)=>\s*layer\.visible!==false && layer\.layer_type==="MASK"/);
  assert.match(source,/IMAGE_STUDIO_EXPORT_SEMANTIC_MASK_REVIEW_REQUIRED/);
  assert.match(source,/IMAGE_STUDIO_EXPORT_SMART_MASK_REVIEW_REQUIRED/);
});
