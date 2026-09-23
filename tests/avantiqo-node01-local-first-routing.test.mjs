import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const intelligence=fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceLocalQueueRuntime.js","utf8");
const service=fs.readFileSync("lib/platform/service-runtime/execution/ServiceExecutionRuntime.js","utf8");
const image=fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-image/AvantiqoImageProvider.js","utf8");
const audio=fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoAudioProvider.js","utf8");
const worker=fs.readFileSync("scripts/local-node/avantiqo-node01-worker.ps1","utf8");

test("all intelligence lanes can choose Node01 first when the local model fits",()=>{
  assert.match(intelligence,/new Set\(\["front", "fast", "deep"\]\)/);
  assert.match(service,/\["front", "fast", "deep"\]\.includes\(intelligenceExecutionLane\)/);
  assert.match(service,/\["front", "fast", "deep"\]\.includes\(intelligenceLane\)/);
});

test("Image Studio sends analysis materials and upscale to Node01 first",()=>{
  assert.match(image,/AvantiqoDocumentVisionLocalQueueProvider\.available\(capability\)/);
  assert.match(image,/AvantiqoImageUpscaleLocalQueueProvider\.available/);
  assert.match(worker,/ai\.image\.analyze/);
  assert.match(worker,/creative\.materials\.estimate/);
  assert.match(worker,/ai\.image\.upscale/);
});

test("Audio Studio sends SFX and elastic processing to Node01 first",()=>{
  assert.match(audio,/AvantiqoSfxLocalQueueProvider\.available/);
  assert.match(audio,/AvantiqoMusicElasticLocalQueueProvider\.available/);
  assert.match(audio,/AVANTIQO_SFX_LOCAL_FALLBACK_MODAL/);
  assert.match(audio,/AVANTIQO_MUSIC_ELASTIC_LOCAL_FALLBACK_MODAL/);
});

test("GPU-heavy generation stays off Node01 unless Node01 actually advertises it",()=>{
  assert.doesNotMatch(worker,/['"]ai\.image\.generate['"]/);
  assert.doesNotMatch(worker,/['"]ai\.video\.generate['"]/);
});
