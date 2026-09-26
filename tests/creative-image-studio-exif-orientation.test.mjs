import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("deterministic export normalizes EXIF orientation before source geometry",()=>{
  const source=fs.readFileSync("lib/creative/stills/runtime/CreativeImageStudioExportRuntime.js","utf8");
  const helper=source.indexOf("async function normalizeImageStudioSourceOrientation");
  const autoOrient=source.indexOf(".autoOrient()",helper);
  const call=source.indexOf("const orientedSource=await normalizeImageStudioSourceOrientation(input)",autoOrient);
  const geometry=source.indexOf("imageStudioSourceCropGeometry(layer",call);
  assert.ok(helper>=0&&autoOrient>helper&&call>autoOrient&&geometry>call);
  assert.match(source,/width: orientedSource\.width, height: orientedSource\.height/);
  assert.match(source,/sharp\(orientedSource\.bytes\)/);
});

test("source orientation normalization is recorded in deterministic export evidence",()=>{
  const source=fs.readFileSync("lib/creative/stills/runtime/CreativeImageStudioExportRuntime.js","utf8");
  assert.match(source,/sourceOrientationEvidence\.push/);
  assert.match(source,/source_orientation:orientedSource\.source_orientation/);
  assert.match(source,/orientation_normalized:orientedSource\.orientation_normalized/);
  assert.match(source,/source_orientation: \{ normalized_before_geometry:true, layers:sourceOrientationEvidence \}/);
});
