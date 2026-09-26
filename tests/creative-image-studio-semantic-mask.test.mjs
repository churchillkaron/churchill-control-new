import test from "node:test";
import assert from "node:assert/strict";
import { buildImageStudioSemanticMaskPatch, attachImageStudioSemanticMatte, validateImageStudioSemanticMask, semanticMaskAlphaForPixel } from "../lib/creative/stills/runtime/CreativeImageStudioSemanticMaskRuntime.js";

test("luminance color-range and alpha masks are deterministic selections",()=>{
  assert.equal(buildImageStudioSemanticMaskPatch("LUMINANCE").semantic_status,"READY_DETERMINISTIC");
  assert.equal(buildImageStudioSemanticMaskPatch("COLOR_RANGE",{color:"#ff0000"}).semantic_color,"#ff0000");
  assert.equal(semanticMaskAlphaForPixel({r:255,g:255,b:255,a:11},buildImageStudioSemanticMaskPatch("LUMINANCE")),255);
  assert.equal(semanticMaskAlphaForPixel({r:0,g:0,b:0,a:11},buildImageStudioSemanticMaskPatch("LUMINANCE")),0);
  assert.equal(semanticMaskAlphaForPixel({r:20,g:30,b:40,a:77},buildImageStudioSemanticMaskPatch("ALPHA")),77);
});

test("color range isolates matching pixels with governed tolerance",()=>{
  const metadata=buildImageStudioSemanticMaskPatch("COLOR_RANGE",{color:"#ff0000",tolerance:.05,softness:.1});
  assert.equal(semanticMaskAlphaForPixel({r:255,g:0,b:0},metadata),255);
  assert.equal(semanticMaskAlphaForPixel({r:0,g:255,b:0},metadata),0);
});

test("subject and background masks fail closed until matte evidence is attached",()=>{
  const mask={id:"m",source_asset_id:null,metadata:{clip_mask_target_id:"img",...buildImageStudioSemanticMaskPatch("SUBJECT")}};
  const target={id:"img",source_asset_id:"source"};
  assert.equal(validateImageStudioSemanticMask(mask,target).ready,false);
  const ready=attachImageStudioSemanticMatte(mask,{mask_asset_id:"matte",source_asset_id:"source",source_checksum:"abc",confidence:.99});
  assert.equal(ready.source_asset_id,"matte");
  assert.equal(validateImageStudioSemanticMask(ready,target).ready,true);
});

test("semantic matte cannot silently belong to another source image",()=>{
  const mask=attachImageStudioSemanticMatte({id:"m",metadata:{clip_mask_target_id:"img",...buildImageStudioSemanticMaskPatch("BACKGROUND")}},{mask_asset_id:"matte",source_asset_id:"other"});
  const result=validateImageStudioSemanticMask(mask,{id:"img",source_asset_id:"source"});
  assert.equal(result.ready,false);
  assert.ok(result.failures.includes("SEMANTIC_MASK_SOURCE_MISMATCH"));
});
