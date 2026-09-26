import test from "node:test";
import assert from "node:assert/strict";
import { normalizeImageStudioCurvePoints, buildImageStudioCurveLut, applyImageStudioCurvesToPixels, addImageStudioCurvePoint, updateImageStudioCurvePoint, removeImageStudioCurvePoint } from "../lib/creative/stills/runtime/CreativeImageStudioCurvesRuntime.js";

test("curves normalize ordered bounded endpoints",()=>{
  const points=normalizeImageStudioCurvePoints([{x:.8,y:2},{x:.2,y:-1}]);
  assert.deepEqual(points,[{x:0,y:0},{x:.2,y:0},{x:.8,y:1},{x:1,y:1}]);
});

test("curve LUT is deterministic and identity by default",()=>{
  const lut=buildImageStudioCurveLut([{x:0,y:0},{x:1,y:1}]);
  assert.equal(lut[0],0); assert.equal(lut[128],128); assert.equal(lut[255],255);
});

test("master curve applies before individual RGB channel curves and preserves alpha",()=>{
  const raw=Buffer.from([100,100,100,77]);
  const result=applyImageStudioCurvesToPixels(raw,1,1,4,{MASTER:[{x:0,y:0},{x:1,y:.5}],RED:[{x:0,y:0},{x:1,y:1}],GREEN:[{x:0,y:0},{x:1,y:1}],BLUE:[{x:0,y:0},{x:1,y:1}]});
  assert.ok(result.bytes[0]<100); assert.equal(result.bytes[0],result.bytes[1]); assert.equal(result.bytes[3],77);
});

test("curve point editing is non-destructive and bounded",()=>{
  let curves=addImageStudioCurvePoint({},"MASTER",{x:.5,y:.7});
  assert.equal(curves.MASTER.length,3);
  curves=updateImageStudioCurvePoint(curves,"MASTER",1,{x:.4,y:.9});
  assert.equal(curves.MASTER[1].x,.4); assert.equal(curves.MASTER[1].y,.9);
  curves=removeImageStudioCurvePoint(curves,"MASTER",1);
  assert.equal(curves.MASTER.length,2);
});


test("Image Studio exposes an interactive master and RGB curve graph", async()=>{
  const fs=await import("node:fs");
  const editor=fs.readFileSync("components/creative/specialist/ImageStudioCurvesEditor.jsx","utf8");
  const inspector=fs.readFileSync("components/creative/specialist/ImageStudioLayerInspector.jsx","utf8");
  assert.match(editor,/MASTER/);
  assert.match(editor,/RED/);
  assert.match(editor,/GREEN/);
  assert.match(editor,/BLUE/);
  assert.match(editor,/Click graph to add/);
  assert.match(editor,/onPointerMove/);
  assert.match(editor,/onDoubleClick/);
  assert.match(inspector,/ImageStudioCurvesEditor/);
  assert.match(inspector,/onBegin=\{workspace\.beginHistoryTransaction\}/);
  assert.match(inspector,/onEnd=\{workspace\.endHistoryTransaction\}/);
});

test("deterministic export activates non-identity curves", async()=>{
  const fs=await import("node:fs");
  const exporter=fs.readFileSync("lib/creative/stills/runtime/CreativeImageStudioExportRuntime.js","utf8");
  assert.match(exporter,/imageStudioCurvesAreIdentity/);
  assert.match(exporter,/!imageStudioCurvesAreIdentity\(adjustment\.curves\)/);
  assert.match(exporter,/rgb_channel_curves: true/);
});
