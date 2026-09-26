import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { IMAGE_STUDIO_EXPORT_FORMATS, normalizeImageStudioExportFormat } from "../lib/creative/stills/runtime/CreativeImageStudioExportFormatRuntime.js";

test("Image Studio export format normalization accepts only canonical supported formats",()=>{
  assert.deepEqual(IMAGE_STUDIO_EXPORT_FORMATS,["PNG","JPEG","PDF"]);
  assert.equal(normalizeImageStudioExportFormat(),"PNG");
  assert.equal(normalizeImageStudioExportFormat("jpeg"),"JPEG");
  assert.equal(normalizeImageStudioExportFormat(" pdf "),"PDF");
});

test("unsupported export formats fail closed instead of emitting mislabeled PNG bytes",()=>{
  assert.throws(()=>normalizeImageStudioExportFormat("TIFF"),/IMAGE_STUDIO_EXPORT_FORMAT_UNSUPPORTED:TIFF/);
  assert.throws(()=>normalizeImageStudioExportFormat("WEBP"),/IMAGE_STUDIO_EXPORT_FORMAT_UNSUPPORTED:WEBP/);
});

test("deterministic export normalizes format before encoder dispatch",()=>{
  const source=fs.readFileSync("lib/creative/stills/runtime/CreativeImageStudioExportRuntime.js","utf8");
  assert.match(source,/normalizeImageStudioExportFormat\(format\)/);
  assert.match(source,/target === "JPEG"/);
  assert.match(source,/target === "PDF"/);
  assert.doesNotMatch(source,/String\(format \|\| "PNG"\)\.toUpperCase\(\)/);
});
