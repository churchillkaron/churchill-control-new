import test from "node:test";
import assert from "node:assert/strict";
import { applyImageStudioLightWrap } from "../lib/creative/stills/runtime/CreativeImageStudioContactRealismRuntime.js";

const style={contact_realism:{light_wrap_strength:1,light_wrap_width_px:1,light_wrap_color:"#ffffff"}};

test("uniform translucent interior is not mistaken for an alpha boundary",()=>{
  const raw=Buffer.from([
    40,50,60,120,
    40,50,60,120,
    40,50,60,120,
  ]);
  const out=applyImageStudioLightWrap(raw,3,1,4,style);
  assert.deepEqual([...out.bytes],[...raw]);
  assert.equal(out.wrapped_pixel_count,0);
  assert.equal(out.boundary_band_only,true);
});

test("light wrap still affects both sides of a real alpha transition",()=>{
  const raw=Buffer.from([
    40,40,40,255,
    40,40,40,120,
  ]);
  const out=applyImageStudioLightWrap(raw,2,1,4,style);
  assert.ok(out.bytes[0]>40);
  assert.ok(out.bytes[4]>40);
  assert.equal(out.bytes[3],255);
  assert.equal(out.bytes[7],120);
  assert.equal(out.wrapped_pixel_count,2);
});

test("fully transparent pixels remain untouched even beside opaque content",()=>{
  const raw=Buffer.from([
    100,90,80,255,
    7,8,9,0,
  ]);
  const out=applyImageStudioLightWrap(raw,2,1,4,style);
  assert.deepEqual([...out.bytes.slice(4,8)],[7,8,9,0]);
});

test("flat opaque interior remains stable while nearby boundary receives wrap",()=>{
  const raw=Buffer.from([
    30,30,30,255,
    30,30,30,255,
    30,30,30,80,
  ]);
  const out=applyImageStudioLightWrap(raw,3,1,4,style);
  assert.deepEqual([...out.bytes.slice(0,3)],[30,30,30]);
  assert.ok(out.bytes[4]>30);
  assert.ok(out.bytes[8]>30);
});
