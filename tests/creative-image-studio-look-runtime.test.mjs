import test from "node:test";
import assert from "node:assert/strict";
import { normalizeImageStudioLook, imageStudioLookIsIdentity, applyImageStudioLook } from "../lib/creative/stills/runtime/CreativeImageStudioLookRuntime.js";

test("look runtime normalizes identity defaults",()=>{
 const look=normalizeImageStudioLook({});
 assert.equal(look.gradient_map.enabled,false);
 assert.equal(look.gradient_map.stops[0].position,0);
 assert.equal(look.gradient_map.stops.at(-1).position,1);
 assert.equal(look.creative_look.preset,"NEUTRAL");
 assert.equal(imageStudioLookIsIdentity(look),true);
});
test("gradient map remaps luminance while preserving alpha",()=>{
 const raw=Buffer.from([0,0,0,77,255,255,255,88]);
 const out=applyImageStudioLook(raw,2,1,4,{gradient_map:{enabled:true,strength:1,stops:[{position:0,color:"#ff0000"},{position:1,color:"#0000ff"}]}});
 assert.deepEqual([...out.bytes.slice(0,3)],[255,0,0]);
 assert.deepEqual([...out.bytes.slice(4,7)],[0,0,255]);
 assert.equal(out.bytes[3],77);assert.equal(out.bytes[7],88);
});
test("split toning moves shadows and highlights toward independent colors",()=>{
 const raw=Buffer.from([20,20,20,255,235,235,235,255]);
 const out=applyImageStudioLook(raw,2,1,4,{split_toning:{enabled:true,shadow_color:"#0000ff",highlight_color:"#ff0000",strength:1}});
 assert.ok(out.bytes[2]>out.bytes[0]);
 assert.ok(out.bytes[4]>out.bytes[6]);
});
test("creative look presets are strength blended rather than destructive replacement",()=>{
 const raw=Buffer.from([120,100,80,99]);
 const neutral=applyImageStudioLook(raw,1,1,4,{creative_look:{preset:"TEAL_ORANGE",strength:0}});
 const graded=applyImageStudioLook(raw,1,1,4,{creative_look:{preset:"TEAL_ORANGE",strength:1}});
 assert.deepEqual([...neutral.bytes], [...raw]);
 assert.notDeepEqual([...graded.bytes.slice(0,3)],[120,100,80]);
 assert.equal(graded.bytes[3],99);
});
