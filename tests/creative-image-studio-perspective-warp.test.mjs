import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  normalizeImageStudioPerspectiveWarp,
  imageStudioPerspectiveWarpIsIdentity,
  imageStudioPerspectiveCssPreview,
  projectImageStudioPerspectivePoint,
  applyImageStudioPerspectiveWarp,
} from "../lib/creative/stills/runtime/CreativeImageStudioPerspectiveWarpRuntime.js";

test("perspective warp normalizes bounded corners and identity",()=>{
  const style={perspective_warp:{enabled:true}};
  const warp=normalizeImageStudioPerspectiveWarp(style);
  assert.equal(warp.enabled,true);
  assert.equal(warp.degenerate,false);
  assert.equal(imageStudioPerspectiveWarpIsIdentity(style),true);
});

test("degenerate or crossing perspective quads fail closed",()=>{
  const style={perspective_warp:{enabled:true,top_left:{x:0,y:0},top_right:{x:1,y:1},bottom_right:{x:1,y:0},bottom_left:{x:0,y:1}}};
  const warp=normalizeImageStudioPerspectiveWarp(style);
  assert.equal(warp.degenerate,true);
  assert.equal(warp.enabled,false);
});

test("perspective warp preserves buffer dimensions and alpha outside destination quad",()=>{
  const raw=Buffer.alloc(4*4*4,255);
  const style={perspective_warp:{enabled:true,top_left:{x:.25,y:0},top_right:{x:.75,y:0},bottom_right:{x:1,y:1},bottom_left:{x:0,y:1}}};
  const out=applyImageStudioPerspectiveWarp(raw,4,4,4,style);
  assert.equal(out.applied,true);
  assert.equal(out.bytes.length,raw.length);
  assert.deepEqual([out.width,out.height,out.channels],[4,4,4]);
  assert.equal(out.bytes[3],0);
});

test("perspective warp rejects non-image buffers and low-channel data",()=>{
  assert.throws(()=>applyImageStudioPerspectiveWarp("bad",2,2,4,{}),/RAW_BUFFER_REQUIRED/);
  assert.throws(()=>applyImageStudioPerspectiveWarp(Buffer.alloc(4),2,2,1,{}),/RGB_CHANNELS_REQUIRED/);
});

test("deterministic export executes perspective before rotation and compositing",()=>{
  const source=fs.readFileSync("lib/creative/stills/runtime/CreativeImageStudioExportRuntime.js","utf8");
  const warp=source.indexOf("applyImageStudioPerspectiveWarp");
  const rotation=source.indexOf("const rotation = num(layer.transform?.rotation)");
  const composite=source.indexOf("const subjectComposite=");
  assert.ok(warp>=0&&rotation>warp&&composite>rotation);
  assert.match(source,/normalizeImageStudioPerspectiveWarp/);
});

test("canvas and inspector expose shared governed perspective preview geometry",()=>{
  const inspector=fs.readFileSync("components/creative/specialist/ImageStudioLayerInspector.jsx","utf8");
  const canvas=fs.readFileSync("components/creative/specialist/ImageStudioCanvasSurface.jsx","utf8");
  assert.match(inspector,/Perspective warp/);
  assert.match(inspector,/patchPerspective/);
  assert.match(inspector,/TL X/);
  assert.match(inspector,/BR Y/);
  assert.match(inspector,/Canvas and export share the same governed projective geometry/);
  assert.match(canvas,/imageStudioPerspectiveCssPreview/);
  assert.match(canvas,/data-perspective-preview/);
  assert.match(canvas,/perspectiveStyle/);
});

test("perspective CSS preview maps source corners to governed destination corners",()=>{
  const style={perspective_warp:{enabled:true,top_left:{x:.1,y:.2},top_right:{x:.9,y:.05},bottom_right:{x:.8,y:.95},bottom_left:{x:.2,y:.85}}};
  const preview=imageStudioPerspectiveCssPreview(style,200,100);
  assert.equal(preview.enabled,true);
  assert.match(preview.transform,/^matrix3d\(/);
  assert.equal(preview.transform_origin,"0 0");
  const expected=[[0,0,20,20],[200,0,180,5],[200,100,160,95],[0,100,40,85]];
  for(const [x,y,tx,ty] of expected){
    const point=projectImageStudioPerspectivePoint(preview.matrix,{x,y});
    assert.ok(Math.abs(point.x-tx)<1e-6);
    assert.ok(Math.abs(point.y-ty)<1e-6);
  }
});

test("perspective CSS preview disables identity and degenerate warps",()=>{
  assert.equal(imageStudioPerspectiveCssPreview({perspective_warp:{enabled:true}},300,200).enabled,false);
  const degenerate={perspective_warp:{enabled:true,top_left:{x:0,y:0},top_right:{x:1,y:1},bottom_right:{x:1,y:0},bottom_left:{x:0,y:1}}};
  assert.equal(imageStudioPerspectiveCssPreview(degenerate,300,200).enabled,false);
});
