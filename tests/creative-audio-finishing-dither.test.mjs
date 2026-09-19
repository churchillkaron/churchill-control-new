import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("final audio finishing stays float32 until 24-bit WAV delivery and applies explicit TPDF",()=>{
  const source=fs.readFileSync(new URL("../lib/creative/audio/runtime/CreativeAudioFinishingRuntime.js",import.meta.url),"utf8");
  assert.match(source,/master-float\.wav/);
  assert.match(source,/"-c:a", "pcm_f32le", masterPath/);
  assert.match(source,/osf=s32:output_sample_bits=24:dither_method=triangular/);
  assert.match(source,/dither_method:.*TPDF_TRIANGULAR/);
  assert.match(source,/final_integer_pcm_conversion_only: true/);
});

test("music release requests and persists dither evidence for 24-bit WAV",()=>{
  const source=fs.readFileSync(new URL("../app/api/creative/music/release-render/route.js",import.meta.url),"utf8");
  assert.match(source,/codec: "pcm_s24le", bit_depth: 24, dither_required: true/);
  assert.match(source,/dither: Array\.isArray\(report\.deliveries\)/);
  assert.match(source,/final_integer_pcm_conversion_only/);
});

test("workstation pre-master remains explicitly undithered intermediate",()=>{
  const source=fs.readFileSync(new URL("../lib/creative/music/client/MusicOfflineMixRenderRuntime.js",import.meta.url),"utf8");
  assert.match(source,/dither_applied: false/);
  assert.match(source,/dither_required_before_final_master_delivery: true/);
});
