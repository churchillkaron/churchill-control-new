import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { imageStudioSharpIccProfile, normalizeImageStudioOutputColorSpace } from "../lib/creative/stills/runtime/CreativeImageStudioColorManagementRuntime.js";

test("Image Studio output color management defaults to canonical sRGB",()=>{
  assert.equal(normalizeImageStudioOutputColorSpace(),"SRGB");
  assert.equal(normalizeImageStudioOutputColorSpace("srgb"),"SRGB");
  assert.equal(imageStudioSharpIccProfile("SRGB"),"srgb");
});

test("unsupported output color spaces fail closed until preview and export are both governed",()=>{
  assert.throws(()=>normalizeImageStudioOutputColorSpace("DISPLAY_P3"),/IMAGE_STUDIO_OUTPUT_COLOR_SPACE_UNSUPPORTED:DISPLAY_P3/);
  assert.throws(()=>normalizeImageStudioOutputColorSpace("CMYK"),/IMAGE_STUDIO_OUTPUT_COLOR_SPACE_UNSUPPORTED:CMYK/);
});

test("deterministic export binds final encoding to color-management contract without overclaiming PDF output intent",()=>{
  const source=fs.readFileSync("lib/creative/stills/runtime/CreativeImageStudioExportRuntime.js","utf8");
  assert.match(source,/normalizeImageStudioOutputColorSpace/);
  assert.match(source,/withIccProfile\(iccProfile\)/);
  assert.match(source,/CREATIVE_IMAGE_STUDIO_COLOR_MANAGEMENT_V1/);
  assert.match(source,/raster_profile_embedded:true/);
  assert.match(source,/pdf_output_intent_embedded:false/);
});
