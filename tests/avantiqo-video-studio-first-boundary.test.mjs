import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const provider=fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoProviderV2.js","utf8");
const registration=fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoProviderRegistration.js","utf8");
const local=fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoLocalQueueProvider.js","utf8");

test("Studio generation is lineage-bound before Node01 execution",()=>{
  assert.match(provider,/CREATIVE_SHOT_BIBLE_V1/);
  assert.match(provider,/CREATIVE_VIDEO_GENERATION_ENVELOPE_V1/);
  assert.match(provider,/AVANTIQO_VIDEO_GENERATION_ENVELOPE_REQUIRED/);
  assert.match(provider,/STUDIO_VISUAL_GENERATION_MASTER_LOCKED/);
  assert.match(local,/generation_envelope/);
  assert.match(local,/shot_bible/);
});

test("Studio Video boundary is local-only and legacy Pod workflows stay absent",()=>{
  assert.match(registration,/local_only_execution: true/);
  assert.match(registration,/modal_fallback_allowed: false/);
  assert.equal(fs.existsSync("lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoWorkflowRuntimeV3.js"),false);
  assert.equal(fs.existsSync("lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoPodRuntime.js"),false);
});
