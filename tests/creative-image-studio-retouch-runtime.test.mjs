import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { normalizeImageStudioRetouchRegion, imageStudioRetouchPreviewStyle, buildImageStudioRetouchOperation, applyImageStudioRetouchOperations } from "../lib/creative/stills/runtime/CreativeImageStudioRetouchRuntime.js";

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

test("rotated layer region inverse-maps artboard geometry into layer-local pixels",()=>{
  const region=normalizeImageStudioRetouchRegion({x:0,y:0,width:50,height:50},{bounds:{x:0,y:0,width:100,height:100},transform:{rotation:90}});
  assert.equal(region.rotation_degrees,-90);
  assert.deepEqual(region.polygon.map((point)=>({x:Number(point.x.toFixed(6)),y:Number(point.y.toFixed(6))})),[
    {x:0,y:1},{x:0,y:.5},{x:.5,y:.5},{x:.5,y:1},
  ]);
  assert.deepEqual({x:region.x,y:region.y,width:region.width,height:region.height},{x:0,y:.5,width:.5,height:.5});
});

test("rotated dodge targets inverse-mapped local pixels before layer rotation",()=>{
  const layer={bounds:{x:0,y:0,width:100,height:100},transform:{rotation:90}};
  const op=buildImageStudioRetouchOperation({kind:"DODGE",region:{x:0,y:0,width:50,height:50},layer,amount:1,feather:0});
  const src=Buffer.alloc(4*4*4,100);for(let i=3;i<src.length;i+=4)src[i]=255;
  const out=applyImageStudioRetouchOperations(src,4,4,4,[op]);
  const topLeft=(0*4+0)*4,bottomLeft=(2*4+0)*4,bottomRight=(2*4+2)*4;
  assert.equal(out.bytes[topLeft],100);
  assert.ok(out.bytes[bottomLeft]>100);
  assert.equal(out.bytes[bottomRight],100);
  assert.equal(op.rotation_aware,true);
});

test("rotated clone maps equal artboard regions through layer-local quadrilaterals",()=>{
  const layer={bounds:{x:0,y:0,width:100,height:100},transform:{rotation:90}};
  const op=buildImageStudioRetouchOperation({
    kind:"CLONE",
    source_region:{x:0,y:0,width:50,height:50},
    region:{x:50,y:0,width:50,height:50},
    layer,amount:1,feather:0,
  });
  const src=Buffer.alloc(4*4*4,0);
  for(let y=0;y<4;y++)for(let x=0;x<4;x++){const i=(y*4+x)*4;const bottomLeft=x<2&&y>=2;src[i]=bottomLeft?220:60;src[i+1]=bottomLeft?30:60;src[i+2]=bottomLeft?30:60;src[i+3]=255;}
  const out=applyImageStudioRetouchOperations(src,4,4,4,[op]);
  const localTopLeft=(0*4+0)*4;
  assert.ok(out.bytes[localTopLeft]>150);
  assert.equal(out.bytes[localTopLeft+1],30);
});

test("rotated retouch still rejects regions that do not intersect the transformed layer",()=>{
  assert.throws(()=>normalizeImageStudioRetouchRegion({x:500,y:500,width:20,height:20},{bounds:{x:0,y:0,width:100,height:100},transform:{rotation:45}}),/REGION_OUTSIDE_LAYER/);
});

test("deterministic export applies retouch operations and records contract",()=>{
  const source=fs.readFileSync("lib/creative/stills/runtime/CreativeImageStudioExportRuntime.js","utf8");
  assert.match(source,/applyImageStudioRetouchOperations/);
  assert.match(source,/CREATIVE_IMAGE_STUDIO_RETOUCH_V3/);
  assert.match(source,/rotation_aware_regions: true/);
  assert.match(source,/bounded_region_operations: true/);
});

test("canvas previews stored localized retouch operations",()=>{
  const source=fs.readFileSync("components/creative/specialist/ImageStudioCanvasSurface.jsx","utf8");
  assert.match(source,/imageStudioRetouchPreviewStyle/);
  assert.match(source,/retouch_operations/);
  assert.match(source,/imageStudioRetouchPreviewStyle\(operation,r\.width\*scale,r\.height\*scale\)/);
});

test("inspector exposes rotation-aware Region retouch for dodge burn clone and heal",()=>{
  const source=fs.readFileSync("components/creative/specialist/ImageStudioLayerInspector.jsx","utf8");
  const store=fs.readFileSync("components/creative/specialist/useImageStudioWorkspaceStore.js","utf8");
  assert.match(source,/Dodge region/);
  assert.match(source,/Burn region/);
  assert.match(source,/Clone to Region/);
  assert.match(source,/Heal Region/);
  assert.match(source,/Rotation-aware retouch/);
  assert.doesNotMatch(source,/Rotate back to 0° before region retouch/);
  assert.match(store,/addRetouchOperation/);
  assert.match(store,/buildImageStudioRetouchOperation/);
});

test("dodge and burn leave fully transparent hidden RGB untouched",()=>{
  const src=Buffer.from([20,30,40,0]);
  const out=applyImageStudioRetouchOperations(src,1,1,4,[{kind:"DODGE",region:{x:0,y:0,width:1,height:1},amount:1,feather:0}]);
  assert.deepEqual([...out.bytes],[20,30,40,0]);
});

test("clone ignores hidden RGB from a fully transparent source pixel",()=>{
  const src=Buffer.from([
    0,255,0,0,
    100,100,100,255,
  ]);
  const out=applyImageStudioRetouchOperations(src,2,1,4,[{kind:"CLONE",source_region:{x:0,y:0,width:.5,height:1},region:{x:.5,y:0,width:.5,height:1},amount:1,feather:0}]);
  assert.deepEqual([...out.bytes.slice(4,8)],[100,100,100,255]);
});

test("heal statistics exclude fully transparent source RGB contamination",()=>{
  const src=Buffer.from([
    200,20,20,255,
    0,0,0,0,
    100,100,100,255,
    100,100,100,255,
  ]);
  const out=applyImageStudioRetouchOperations(src,4,1,4,[{kind:"HEAL",source_region:{x:0,y:0,width:.5,height:1},region:{x:.5,y:0,width:.5,height:1},amount:1,feather:0}]);
  assert.deepEqual([...out.bytes.slice(8,12)],[100,100,100,255]);
  assert.deepEqual([...out.bytes.slice(12,16)],[100,100,100,255]);
});

test("rotated retouch preview uses the same local quad orientation as pixel execution",()=>{
  const layer={bounds:{x:0,y:0,width:100,height:100},transform:{rotation:90}};
  const op=buildImageStudioRetouchOperation({kind:"DODGE",region:{x:0,y:0,width:50,height:50},layer,amount:.5,feather:.25});
  const style=imageStudioRetouchPreviewStyle(op,200,200);
  assert.equal(style.left,0);
  assert.equal(style.top,200);
  assert.equal(Math.round(style.width),100);
  assert.equal(Math.round(style.height),100);
  assert.match(style.transform,/rotate\(-90(?:\.0+)?deg\)/);
  assert.equal(style.transformOrigin,"0 0");
});
