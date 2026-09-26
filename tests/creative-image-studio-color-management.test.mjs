import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { imageStudioSharpIccProfile, normalizeImageStudioOutputColorSpace, resolveImageStudioOutputDensity } from "../lib/creative/stills/runtime/CreativeImageStudioColorManagementRuntime.js";

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

test("print density is only emitted from authoritative artboard DPI or canonical A4 print preset",()=>{
  assert.equal(resolveImageStudioOutputDensity({metadata:{target_dpi:240}}),240);
  assert.equal(resolveImageStudioOutputDensity({export_preset:{id:"a4_print"}}),300);
  assert.equal(resolveImageStudioOutputDensity({export_preset:{id:"instagram_portrait"}}),null);
  assert.equal(resolveImageStudioOutputDensity({metadata:{target_dpi:12}}),null);
});

test("deterministic export writes governed density metadata without inventing it for screen artboards",()=>{
  const source=fs.readFileSync("lib/creative/stills/runtime/CreativeImageStudioExportRuntime.js","utf8");
  assert.match(source,/resolveImageStudioOutputDensity\(artboard\)/);
  assert.match(source,/withMetadata\(\{density:outputDensity\}\)/);
  assert.match(source,/output_density_dpi:outputDensity/);
  assert.match(source,/density_metadata_embedded:Boolean\(outputDensity\)/);
});
