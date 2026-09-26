import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { imageStudioMaskPreviewDescriptor } from "../lib/creative/stills/runtime/CreativeImageStudioReusableDesignRuntime.js";
import { imageStudioAdjustmentPreviewDescriptors } from "../lib/creative/stills/runtime/CreativeImageStudioAdjustmentPreviewRuntime.js";

const target={id:"img",artboard_id:"board",layer_type:"IMAGE",bounds:{x:0,y:0,width:200,height:100}};

test("simple geometric clip mask remains exact in canvas preview",()=>{
  const mask={id:"m",artboard_id:"board",layer_type:"MASK",bounds:{x:50,y:20,width:100,height:60},metadata:{clip_mask_target_id:"img",mask_shape:"ELLIPSE",mask_opacity:1,mask_feather:0}};
  const preview=imageStudioMaskPreviewDescriptor(target,mask);
  assert.equal(preview.preview_supported,true);
  assert.equal(preview.fidelity,"EXACT_GEOMETRIC_SCOPE");
  assert.match(preview.style.clipPath,/ellipse/);
});

test("zero-feather invert and partial-opacity geometric masks keep exact alpha preview",()=>{
  for(const metadata of [
    {mask_shape:"RECT",mask_feather:0,mask_opacity:1,mask_invert:true},
    {mask_shape:"ELLIPSE",mask_feather:0,mask_opacity:.5},
  ]){
    const preview=imageStudioMaskPreviewDescriptor(target,{id:"m",bounds:{x:20,y:10,width:100,height:60},metadata});
    assert.equal(preview.preview_supported,true);
    assert.equal(preview.fidelity,"EXACT_GEOMETRIC_ALPHA_SCOPE");
    assert.match(preview.style.maskImage,/^url\("data:image\/svg\+xml,/);
    assert.equal(preview.style.WebkitMaskImage,preview.style.maskImage);
    assert.equal(preview.style.maskSize,"100% 100%");
  }
});

test("feathered geometric masks preview through the shared SVG alpha contract",()=>{
  for(const metadata of [
    {mask_shape:"RECT",mask_feather:12,mask_opacity:1,mask_invert:false},
    {mask_shape:"ELLIPSE",mask_feather:8,mask_opacity:.5,mask_invert:true},
  ]){
    const preview=imageStudioMaskPreviewDescriptor(target,{id:"m",bounds:{x:20,y:10,width:100,height:60},metadata});
    assert.equal(preview.preview_supported,true);
    assert.equal(preview.fidelity,"APPROXIMATE_RASTER_EXACT_GEOMETRY");
    assert.equal(preview.reason,null);
    assert.match(preview.style.maskImage,/feGaussianBlur/);
    assert.match(preview.style.maskImage,/stdDeviation/);
    assert.equal(preview.style.WebkitMaskImage,preview.style.maskImage);
  }
});

test("semantic and raster masks stay export-authoritative while brush-refined geometry previews",()=>{
  const semantic=imageStudioMaskPreviewDescriptor(target,{id:"s",bounds:{x:0,y:0,width:200,height:100},metadata:{mask_source_kind:"SEMANTIC",mask_shape:"RECT"}});
  const raster=imageStudioMaskPreviewDescriptor(target,{id:"r",bounds:{x:0,y:0,width:200,height:100},metadata:{mask_source_kind:"RASTER_MATTE",mask_shape:"RECT",mask_provenance:{matte_storage_reference:"storage://creative/matte.png"}}});
  const brush=imageStudioMaskPreviewDescriptor(target,{id:"b",bounds:{x:20,y:10,width:160,height:80},metadata:{mask_shape:"RECT",mask_brush_strokes:[
    {mode:"ADD",points:[{x:.2,y:.2},{x:.8,y:.8}],size_px:32,hardness:.5,opacity:.75},
    {mode:"SUBTRACT",points:[{x:.5,y:.5}],size_px:18,hardness:1,opacity:.4},
  ]}});
  assert.equal(semantic.preview_supported,false);
  assert.equal(semantic.reason,"MASK_SOURCE_PREVIEW_COMPLEX");
  assert.equal(raster.preview_supported,false);
  assert.equal(raster.reason,"MASK_SOURCE_PREVIEW_COMPLEX");
  assert.equal(brush.preview_supported,true);
  assert.equal(brush.fidelity,"APPROXIMATE_RASTER_EXACT_GEOMETRY");
  assert.match(brush.style.maskImage,/stroke%3D%22white%22/);
  assert.match(brush.style.maskImage,/stroke%3D%22black%22/);
  assert.match(brush.style.maskImage,/brush-0/);
});

test("adjustment preview inherits shared semantic mask fidelity decision",()=>{
  const mask={id:"m",artboard_id:"board",layer_type:"MASK",bounds:{x:0,y:0,width:200,height:100},metadata:{clip_mask_target_id:"img",mask_source_kind:"SEMANTIC",semantic_mask_mode:"SUBJECT"}};
  const adjustment={id:"a",artboard_id:"board",layer_type:"ADJUSTMENT",visible:true,metadata:{adjustment_target_layer_ids:["img"],adjustment_mask_layer_id:"m"},style:{adjustments:{exposure:1}}};
  const [preview]=imageStudioAdjustmentPreviewDescriptors([target,adjustment,mask],target);
  assert.equal(preview.preview_supported,false);
  assert.deepEqual(preview.failures,["ADJUSTMENT_MASK_PREVIEW_COMPLEX"]);
  assert.equal(preview.mask_preview_reason,"MASK_SOURCE_PREVIEW_COMPLEX");
});

test("canvas omits false complex clip style and surfaces export-only fidelity badge",()=>{
  const source=fs.readFileSync("components/creative/specialist/ImageStudioCanvasSurface.jsx","utf8");
  assert.match(source,/imageStudioMaskPreviewDescriptor/);
  assert.match(source,/maskPreview\.preview_supported\?maskPreview\.style:\{\}/);
  assert.match(source,/Complex clip mask · export preview only/);
});

test("malformed persisted brush strokes fail conservative without crashing preview",()=>{
  const preview=imageStudioMaskPreviewDescriptor(target,{id:"bad",bounds:{x:0,y:0,width:200,height:100},metadata:{mask_shape:"RECT",mask_brush_strokes:[{mode:"ADD",points:[]}]}});
  assert.equal(preview.preview_supported,false);
  assert.equal(preview.reason,"MASK_BRUSH_PREVIEW_INVALID");
});

test("adjustment masks inherit brush-refined geometric alpha preview",()=>{
  const mask={id:"m2",artboard_id:"board",layer_type:"MASK",bounds:{x:20,y:10,width:160,height:80},metadata:{clip_mask_target_id:"img",mask_shape:"RECT",mask_brush_strokes:[{mode:"SUBTRACT",points:[{x:.25,y:.25},{x:.75,y:.75}],size_px:24,hardness:.6,opacity:.8}]}};
  const adjustment={id:"a2",artboard_id:"board",layer_type:"ADJUSTMENT",visible:true,metadata:{adjustment_target_layer_ids:["img"],adjustment_mask_layer_id:"m2"},style:{adjustments:{exposure:1}}};
  const [preview]=imageStudioAdjustmentPreviewDescriptors([target,adjustment,mask],target);
  assert.equal(preview.preview_supported,true);
  assert.deepEqual(preview.failures,[]);
  assert.match(preview.mask_style.maskImage,/stroke%3D%22black%22/);
});
