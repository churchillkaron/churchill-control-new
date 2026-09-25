import test from "node:test";
import assert from "node:assert/strict";
import { buildImageStudioRetouchOperation, applyImageStudioRetouchOperations, normalizeImageStudioRetouchRegion } from "../lib/creative/stills/runtime/CreativeImageStudioRetouchRuntime.js";

const layer={bounds:{x:0,y:0,width:100,height:100},transform:{rotation:0}};
test("clone and heal require explicit equal-size source and destination regions",()=>{
  const source={x:0,y:0,width:20,height:20},destination={x:40,y:40,width:20,height:20};
  const clone=buildImageStudioRetouchOperation({kind:"CLONE",source_region:source,region:destination,layer});
  const heal=buildImageStudioRetouchOperation({kind:"HEAL",source_region:source,region:destination,layer});
  assert.equal(clone.kind,"CLONE"); assert.equal(heal.kind,"HEAL");
  assert.deepEqual(clone.source_region,normalizeImageStudioRetouchRegion(source,layer));
  assert.throws(()=>buildImageStudioRetouchOperation({kind:"CLONE",source_region:{x:0,y:0,width:10,height:10},region:destination,layer}),/SIZE_MISMATCH/);
});

test("clone copies explicit source pixels while preserving destination alpha",()=>{
  const src=Buffer.alloc(4*2*4,0); for(let i=3;i<src.length;i+=4)src[i]=77;
  for(let y=0;y<2;y++)for(let x=0;x<2;x++){const i=(y*4+x)*4;src[i]=200;src[i+1]=40;src[i+2]=20;}
  const op={kind:"CLONE",source_region:{x:0,y:0,width:.5,height:1},region:{x:.5,y:0,width:.5,height:1},amount:1,feather:0};
  const out=applyImageStudioRetouchOperations(src,4,2,4,[op]);
  const di=(0*4+2)*4; assert.deepEqual([...out.bytes.slice(di,di+3)],[200,40,20]); assert.equal(out.bytes[di+3],77);
});

test("heal transfers source texture while adapting destination tone",()=>{
  const src=Buffer.alloc(4*2*4,255); for(let i=3;i<src.length;i+=4)src[i]=88;
  for(let y=0;y<2;y++)for(let x=0;x<2;x++){const i=(y*4+x)*4;src[i]=40;src[i+1]=50;src[i+2]=60;}
  const op={kind:"HEAL",source_region:{x:0,y:0,width:.5,height:1},region:{x:.5,y:0,width:.5,height:1},amount:1,feather:0};
  const out=applyImageStudioRetouchOperations(src,4,2,4,[op]);
  const di=(0*4+2)*4; assert.ok(out.bytes[di]>150); assert.equal(out.bytes[di+3],88);
});

test("workspace captures explicit source region before clone or heal", async()=>{
  const fs=await import("node:fs");
  const store=fs.readFileSync("components/creative/specialist/useImageStudioWorkspaceStore.js","utf8");
  const inspector=fs.readFileSync("components/creative/specialist/ImageStudioLayerInspector.jsx","utf8");
  assert.match(store,/setRetouchSourceFromRegion/);
  assert.match(store,/retouch_source_region/);
  assert.match(inspector,/Use Region as source/);
  assert.match(inspector,/Clone to Region/);
  assert.match(inspector,/Heal Region/);
});

test("canvas distinguishes source authority and clone-heal destination without fake tonal preview", async()=>{
  const fs=await import("node:fs");
  const canvas=fs.readFileSync("components/creative/specialist/ImageStudioCanvasSurface.jsx","utf8");
  assert.match(canvas,/retouch_source_region/);
  assert.match(canvas,/>Source</);
  assert.match(canvas,/kind==="CLONE"\|\|kind==="HEAL"/);
  assert.match(canvas,/border:"1px dashed rgba/);
});
