import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  normalizeImageStudioPerspectiveWarp,
  imageStudioPerspectiveWarpIsIdentity,
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

test("inspector exposes governed perspective controls without claiming exact canvas parity",()=>{
  const source=fs.readFileSync("components/creative/specialist/ImageStudioLayerInspector.jsx","utf8");
  assert.match(source,/Perspective warp/);
  assert.match(source,/patchPerspective/);
  assert.match(source,/TL X/);
  assert.match(source,/BR Y/);
  assert.match(source,/Deterministic export is authoritative/);
});
