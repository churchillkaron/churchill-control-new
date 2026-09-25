import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildImageStudioRetouchOperation, applyImageStudioRetouchOperations } from "../lib/creative/stills/runtime/CreativeImageStudioRetouchRuntime.js";

test("retouch region is stored normalized to the selected layer",()=>{
  const op=buildImageStudioRetouchOperation({kind:"DODGE",region:{x:150,y:150,width:100,height:100},layer:{bounds:{x:100,y:100,width:400,height:200},transform:{rotation:0}}});
  assert.equal(op.kind,"DODGE");
  assert.deepEqual(op.region,{x:.125,y:.25,width:.25,height:.5});
  assert.equal(op.source_preserving,true);
});

test("dodge and burn are bounded deterministic operations that preserve alpha",()=>{
  const src=Buffer.alloc(4*4*4,100); for(let i=3;i<src.length;i+=4)src[i]=77;
  const op={kind:"DODGE",region:{x:.25,y:.25,width:.5,height:.5},amount:.5,feather:0};
  const out=applyImageStudioRetouchOperations(src,4,4,4,[op]);
  assert.equal(out.bytes[3],77);
  assert.equal(out.bytes[0],100);
  assert.ok(out.bytes[(1*4+1)*4]>100);
});

test("rotated layer retouch fails closed until coordinate transform is explicit",()=>{
  assert.throws(()=>buildImageStudioRetouchOperation({kind:"BURN",region:{x:0,y:0,width:10,height:10},layer:{bounds:{x:0,y:0,width:100,height:100},transform:{rotation:10}}}),/ROTATED_LAYER_UNSUPPORTED/);
});

test("deterministic export applies retouch operations and records contract",()=>{
  const source=fs.readFileSync("lib/creative/stills/runtime/CreativeImageStudioExportRuntime.js","utf8");
  assert.match(source,/applyImageStudioRetouchOperations/);
  assert.match(source,/CREATIVE_IMAGE_STUDIO_RETOUCH_V2/);
  assert.match(source,/bounded_region_operations: true/);
});

test("canvas previews stored localized retouch operations",()=>{
  const source=fs.readFileSync("components/creative/specialist/ImageStudioCanvasSurface.jsx","utf8");
  assert.match(source,/retouchOverlayStyle/);
  assert.match(source,/retouch_operations/);
  assert.match(source,/mixBlendMode:light\?"screen":"multiply"/);
});

test("inspector wires Region to non-destructive dodge and burn actions",()=>{
  const source=fs.readFileSync("components/creative/specialist/ImageStudioLayerInspector.jsx","utf8");
  const store=fs.readFileSync("components/creative/specialist/useImageStudioWorkspaceStore.js","utf8");
  assert.match(source,/Dodge region/);
  assert.match(source,/Burn region/);
  assert.match(source,/Rotate back to 0°/);
  assert.match(store,/addRetouchOperation/);
  assert.match(store,/buildImageStudioRetouchOperation/);
});
