import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const intelligence=fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceLocalQueueRuntime.js","utf8");
const service=fs.readFileSync("lib/platform/service-runtime/execution/ServiceExecutionRuntime.js","utf8");
const image=fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-image/AvantiqoImageProvider.js","utf8");
const audio=fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoAudioProvider.js","utf8");
const worker=fs.readFileSync("scripts/local-node/avantiqo-node01-worker.ps1","utf8");

test("all intelligence lanes can choose Node01 when the local model fits",()=>{
  assert.match(intelligence,/new Set\(\["front", "fast", "deep"\]\)/);
  assert.match(service,/\["front", "fast", "deep"\]\.includes\(intelligenceExecutionLane\)/);
  assert.match(service,/\["front", "fast", "deep"\]\.includes\(intelligenceLane\)/);
});

test("Image Studio routes analysis generation and upscale through Node01 local providers",()=>{
  assert.match(image,/AvantiqoDocumentVisionLocalQueueProvider/);
  assert.match(image,/AvantiqoImageGenerateLocalQueueProvider/);
  assert.match(image,/AvantiqoImageUpscaleLocalQueueProvider/);
  assert.match(worker,/ai\.image\.analyze/);
  assert.match(worker,/ai\.image\.generate/);
  assert.match(worker,/ai\.image\.upscale/);
  assert.doesNotMatch(image,/Modal|modal/);
});

test("Audio Studio routes SFX music and elastic processing through Node01",()=>{
  assert.match(audio,/AvantiqoMusicGenerationLocalQueueProvider/);
  assert.match(audio,/AvantiqoSfxLocalQueueProvider/);
  assert.match(audio,/AvantiqoMusicElasticLocalQueueProvider/);
  assert.match(worker,/ai\.music\.generate/);
  assert.match(worker,/ai\.sfx\.generate/);
  assert.match(worker,/ai\.audio\.elastic-warp/);
  assert.doesNotMatch(audio,/Modal|modal|RunPod|SAFE_LEASE/);
});

test("Node01 explicitly owns current GPU-heavy image and video generation",()=>{
  assert.match(worker,/ai\.image\.generate/);
  assert.match(worker,/RunImageGenerateJob/);
  assert.match(worker,/ai\.video\.generate/);
  assert.match(worker,/RunVideoLtx25Job/);
});
