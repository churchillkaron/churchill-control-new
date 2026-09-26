import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { imageStudioGroundShadowPreview, imageStudioLocalOffsetForRotation } from "../lib/creative/stills/runtime/CreativeImageStudioContactPreviewRuntime.js";

test("shadow preview preserves artboard offset through rotated layer coordinates",()=>{
  const offset=imageStudioLocalOffsetForRotation(10,20,90);
  assert.ok(Math.abs(offset.x-20)<1e-9);
  assert.ok(Math.abs(offset.y+10)<1e-9);
});

test("ground shadow preview carries export shadow opacity geometry color and source crop",()=>{
  const preview=imageStudioGroundShadowPreview({
    style:{opacity:.5,contact_realism:{shadow_enabled:true,shadow_opacity:.4,shadow_blur_px:12,shadow_offset_x:10,shadow_offset_y:20,shadow_scale_y:.25,shadow_color:"#102030"}},
    rotation:0,scale:2,asset_url:"https://example.com/a.png",
    preview:{image:{left:-30,top:-10,width:260,height:140},frame:{borderRadius:"16px"}},
  });
  assert.equal(preview.preview_supported,true);
  assert.equal(preview.shadow.opacity,.2);
  assert.equal(preview.outer_style.opacity,.2);
  assert.equal(preview.outer_style.filter,"blur(24px)");
  assert.equal(preview.outer_style.transform,"translate(20px,40px)");
  assert.equal(preview.silhouette_style.backgroundColor,"rgb(16 32 48)");
  assert.equal(preview.silhouette_style.transform,"scaleY(0.25)");
  assert.equal(preview.silhouette_style.maskSize,"260px 140px");
  assert.equal(preview.silhouette_style.maskPosition,"-30px -10px");
});

test("complex mask shadow preview fails conservative",()=>{
  const preview=imageStudioGroundShadowPreview({
    style:{contact_realism:{shadow_enabled:true,shadow_opacity:.4}},
    asset_url:"https://example.com/a.png",
    has_mask:true,
    mask_style:{opacity:.5,outline:"1px dashed"},
  });
  assert.equal(preview.preview_supported,false);
  assert.equal(preview.reason,"COMPLEX_MASK_EXPORT_ONLY");
});

test("canvas renders governed contact shadow preview and explicit fallback",()=>{
  const source=fs.readFileSync("components/creative/specialist/ImageStudioCanvasSurface.jsx","utf8");
  assert.match(source,/imageStudioGroundShadowPreview/);
  assert.match(source,/data-contact-shadow-preview/);
  assert.match(source,/Complex ground shadow · export preview only/);
  assert.match(source,/shadowPreview\.outer_style/);
  assert.match(source,/shadowPreview\.silhouette_style/);
});
