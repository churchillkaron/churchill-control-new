import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { imageStudioLightWrapPreview } from "../lib/creative/stills/runtime/CreativeImageStudioContactPreviewRuntime.js";

test("light wrap preview resolves export strength width color and crop geometry",()=>{
  const preview=imageStudioLightWrapPreview({
    style:{contact_realism:{light_wrap_strength:.6,light_wrap_width_px:8,light_wrap_color:"#d6a66a"}},
    scale:1.5,asset_url:"https://example.com/source.png",
    preview:{image:{left:-20,top:-10,width:300,height:180}},
  });
  assert.equal(preview.preview_supported,true);
  assert.equal(preview.opacity,.6);
  assert.equal(preview.radius,12);
  assert.equal(preview.color,"#d6a66a");
  assert.deepEqual(preview.image,{left:-20,top:-10,width:300,height:180});
});

test("exact geometric masked light wrap previews inside the same governed mask scope",()=>{
  const maskStyle={clipPath:"inset(10% 20% 30% 15%)"};
  const preview=imageStudioLightWrapPreview({
    style:{contact_realism:{light_wrap_strength:.5,light_wrap_width_px:10}},
    asset_url:"https://example.com/source.png",preview:{image:{width:200,height:100}},has_mask:true,mask_style:maskStyle,
  });
  assert.equal(preview.preview_supported,true);
  assert.deepEqual(preview.mask_style,maskStyle);
});

test("complex masked light wrap still fails conservative because export owns post-mask alpha",()=>{
  const preview=imageStudioLightWrapPreview({
    style:{contact_realism:{light_wrap_strength:.5,light_wrap_width_px:10}},
    asset_url:"https://example.com/source.png",preview:{image:{width:200,height:100}},has_mask:true,mask_style:{outline:"1px dashed"},
  });
  assert.equal(preview.preview_supported,false);
  assert.equal(preview.reason,"MASKED_LIGHT_WRAP_EXPORT_ONLY");
});

test("light wrap overlay uses SVG alpha erosion and can chain governed edge erosion",()=>{
  const source=fs.readFileSync("components/creative/specialist/ImageStudioLightWrapPreviewOverlay.jsx","utf8");
  assert.match(source,/feMorphology/);
  assert.match(source,/operator="erode"/);
  assert.match(source,/SourceAlpha/);
  assert.match(source,/spec\.edge_radius/);
  assert.match(source,/result="edgeAlpha"/);
  assert.match(source,/in="edgeAlpha"/);
  assert.match(source,/innerBand/);
  assert.match(source,/feFlood/);
  assert.match(source,/data-light-wrap-preview/);
  assert.match(source,/style=\{spec\.mask_style\}/);
});

test("canvas and version compare share light wrap preview and masked fidelity warning",()=>{
  const canvas=fs.readFileSync("components/creative/specialist/ImageStudioCanvasSurface.jsx","utf8");
  const compare=fs.readFileSync("components/creative/specialist/ImageStudioVersionCompare.jsx","utf8");
  for(const source of [canvas,compare])assert.match(source,/ImageStudioLightWrapPreviewOverlay/);
  assert.match(canvas,/MASKED_LIGHT_WRAP_EXPORT_ONLY/);
  assert.match(canvas,/EDGE_FINISHED_LIGHT_WRAP_EXPORT_ONLY/);
  assert.match(canvas,/light wrap · deterministic export only/);
  assert.match(compare,/MASKED_LIGHT_WRAP_EXPORT_ONLY/);
  assert.match(canvas,/maskStyle=\{maskStyle\}/);
  assert.match(compare,/maskStyle=\{maskStyle\}/);
  assert.match(canvas,/edgePreview=\{edgePreview\}/);
  assert.match(compare,/edgePreview=\{edgePreview\}/);
});

test("canvas and compare keep export stage ordering around base effects",()=>{
  for(const file of ["components/creative/specialist/ImageStudioCanvasSurface.jsx","components/creative/specialist/ImageStudioVersionCompare.jsx"]){
    const source=fs.readFileSync(file,"utf8");
    const base=source.indexOf("base-effect-preview");
    const adjustment=source.indexOf("adjustment-preview",base);
    const texture=source.indexOf("ImageStudioTexturePreviewOverlay",adjustment);
    assert.ok(base>=0&&adjustment>base&&texture>adjustment,file+" must preserve base effects -> adjustment -> texture");
  }
});
