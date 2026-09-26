import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { imageStudioAdjustmentPreviewDescriptors } from "../lib/creative/stills/runtime/CreativeImageStudioAdjustmentPreviewRuntime.js";

const target={id:"img",artboard_id:"board",layer_type:"IMAGE",bounds:{x:0,y:0,width:200,height:100}};

test("adjustment preview resolves target-scoped layers in export order",()=>{
  const layers=[
    target,
    {id:"late",artboard_id:"board",layer_type:"ADJUSTMENT",visible:true,sort_order:9,metadata:{adjustment_target_layer_ids:["img"]},style:{opacity:.4,adjustments:{exposure:1}}},
    {id:"early",artboard_id:"board",layer_type:"ADJUSTMENT",visible:true,sort_order:2,metadata:{adjustment_target_layer_ids:["img"]},style:{opacity:1,adjustments:{temperature:30}}},
  ];
  const preview=imageStudioAdjustmentPreviewDescriptors(layers,target);
  assert.deepEqual(preview.map(item=>item.id),["early","late"]);
  assert.equal(preview[0].preview_supported,true);
  assert.equal(preview[1].opacity,.4);
  assert.match(preview[0].filter,/brightness\(/);
});

test("simple geometric adjustment mask keeps exact target scope in canvas preview",()=>{
  const mask={id:"m",artboard_id:"board",layer_type:"MASK",bounds:{x:50,y:20,width:100,height:60},metadata:{clip_mask_target_id:"img",mask_shape:"ELLIPSE",mask_opacity:1,mask_feather:0}};
  const adjustment={id:"a",artboard_id:"board",layer_type:"ADJUSTMENT",visible:true,metadata:{adjustment_target_layer_ids:["img"],adjustment_mask_layer_id:"m"},style:{adjustments:{exposure:1}}};
  const [preview]=imageStudioAdjustmentPreviewDescriptors([target,adjustment,mask],target);
  assert.equal(preview.preview_supported,true);
  assert.equal(preview.fidelity,"APPROXIMATE_COLOR_EXACT_SCOPE");
  assert.match(preview.mask_style.clipPath,/ellipse/);
});

test("feathered geometric adjustment masks keep local preview scope",()=>{
  const mask={id:"m",artboard_id:"board",layer_type:"MASK",bounds:{x:20,y:10,width:140,height:80},metadata:{clip_mask_target_id:"img",mask_shape:"RECT",mask_feather:24}};
  const adjustment={id:"a",artboard_id:"board",layer_type:"ADJUSTMENT",visible:true,metadata:{adjustment_target_layer_ids:["img"],adjustment_mask_layer_id:"m"},style:{adjustments:{exposure:1}}};
  const [preview]=imageStudioAdjustmentPreviewDescriptors([target,adjustment,mask],target);
  assert.equal(preview.preview_supported,true);
  assert.equal(preview.fidelity,"APPROXIMATE_COLOR_EXACT_SCOPE");
  assert.deepEqual(preview.failures,[]);
  assert.match(preview.mask_style.maskImage,/feGaussianBlur/);
});

test("canvas consumes sequential adjustment preview descriptors with explicit export-only fallback",()=>{
  const source=fs.readFileSync("components/creative/specialist/ImageStudioCanvasSurface.jsx","utf8");
  assert.match(source,/imageStudioAdjustmentPreviewDescriptors/);
  assert.match(source,/backdropFilter:item\.filter/);
  assert.match(source,/data-adjustment-preview/);
  assert.match(source,/Complex adjustment mask · export preview only/);
});

test("governed raster adjustment mask previews with the same luminance matte and crop geometry",()=>{
  const mask={id:"m",artboard_id:"board",layer_type:"MASK",bounds:{x:0,y:0,width:200,height:100},metadata:{clip_mask_target_id:"img",mask_source_kind:"RASTER_MATTE"}};
  const adjustment={id:"a",artboard_id:"board",layer_type:"ADJUSTMENT",visible:true,metadata:{adjustment_target_layer_ids:["img"],adjustment_mask_layer_id:"m"},style:{adjustments:{exposure:1}}};
  const [preview]=imageStudioAdjustmentPreviewDescriptors([target,adjustment,mask],target,{mask_url_by_layer_id:{m:"https://assets.example/matte.png"},preview_image:{left:-10,top:-5,width:240,height:120}});
  assert.equal(preview.preview_supported,true);
  assert.equal(preview.fidelity,"APPROXIMATE_COLOR_EXACT_SCOPE");
  assert.equal(preview.mask_style.maskMode,"luminance");
  assert.equal(preview.mask_style.maskSize,"240px 120px");
  assert.equal(preview.mask_style.maskPosition,"-10px -5px");
  assert.deepEqual(preview.failures,[]);
});

test("raster adjustment mask without a governed preview URL remains export-only",()=>{
  const mask={id:"m",artboard_id:"board",layer_type:"MASK",bounds:{x:0,y:0,width:200,height:100},metadata:{clip_mask_target_id:"img",mask_source_kind:"RASTER_MATTE"}};
  const adjustment={id:"a",artboard_id:"board",layer_type:"ADJUSTMENT",visible:true,metadata:{adjustment_target_layer_ids:["img"],adjustment_mask_layer_id:"m"},style:{adjustments:{exposure:1}}};
  const [preview]=imageStudioAdjustmentPreviewDescriptors([target,adjustment,mask],target);
  assert.equal(preview.preview_supported,false);
  assert.deepEqual(preview.failures,["ADJUSTMENT_MASK_PREVIEW_COMPLEX"]);
});

test("canvas and version compare pass governed adjustment matte URLs and target crop geometry",()=>{
  for(const file of ["components/creative/specialist/ImageStudioCanvasSurface.jsx","components/creative/specialist/ImageStudioVersionCompare.jsx"]){
    const source=fs.readFileSync(file,"utf8");
    assert.match(source,/governedMaskUrls/);
    assert.match(source,/mask_url_by_layer_id:maskUrlByLayerId/);
    assert.match(source,/preview_image:preview\.image/);
  }
});
