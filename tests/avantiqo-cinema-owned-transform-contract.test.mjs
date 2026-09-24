import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const provider=fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoProviderV2.js","utf8");
const registration=fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoProviderRegistration.js","utf8");
const local=fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoLocalQueueProvider.js","utf8");
const worker=fs.readFileSync("scripts/local-node/avantiqo-node01-worker.ps1","utf8");

test("owned Cinema active transport is Node01 local queue only",()=>{
  assert.match(provider,/AvantiqoVideoLocalQueueProvider\.execute/);
  assert.match(local,/generation_envelope/);
  assert.match(local,/shot_bible/);
  assert.match(local,/shot_id/);
  assert.match(registration,/local_only_execution: true/);
  assert.match(registration,/modal_fallback_allowed: false/);
  assert.doesNotMatch(provider,/RunPod|runpod|Modal|modal/);
});

test("Node01 owns current LTX 2.5 generation",()=>{
  assert.match(registration,/Lightricks\/LTX-2\.5/);
  assert.match(registration,/NODE01_LOCAL_GPU_6GB_CPU_OFFLOAD/);
  assert.match(worker,/RunVideoLtx25Job/);
  assert.match(worker,/ai\.video\.generate/);
});

test("unsupported advanced Cinema transforms fail closed",()=>{
  assert.match(provider,/AVANTIQO_VIDEO_LOCAL_ENGINE_NOT_IMPLEMENTED/);
  assert.match(provider,/AVANTIQO_VIDEO_LOCAL_CAPABILITY_NOT_IMPLEMENTED/);
  assert.match(registration,/implemented_capabilities: IMPLEMENTED_CAPABILITIES/);
  assert.match(registration,/const IMPLEMENTED_CAPABILITIES = Object\.freeze\(\[\s*"ai\.video\.generate"/);
});
