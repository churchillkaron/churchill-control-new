import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("Image Studio JPEG masters preserve full chroma resolution at high quality",()=>{
  const source=fs.readFileSync("lib/creative/stills/runtime/CreativeImageStudioExportRuntime.js","utf8");
  assert.match(source,/jpeg\(\{ quality: 95, chromaSubsampling:"4:4:4" \}\)/);
  assert.match(source,/mime = "image\/jpeg"/);
  assert.match(source,/extension = "jpg"/);
});
