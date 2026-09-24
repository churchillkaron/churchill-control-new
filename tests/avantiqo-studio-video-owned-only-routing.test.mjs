import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const router = fs.readFileSync("lib/creative/video/runtime/CreativeVideoEngineRouter.js", "utf8");
const registration = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoProviderRegistration.js", "utf8");
const provider = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoProviderV2.js", "utf8");
const local = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoLocalQueueProvider.js", "utf8");

test("Studio Cinema is Avantiqo-owned only and external video fallback is impossible", () => {
  assert.match(router, /owned_only_required:\s*true/);
  assert.match(router, /external_fallback_allowed:\s*false/);
  assert.match(registration, /infrastructure_provider:\s*"AVANTIQO_LOCAL_NODE_V1"/);
  assert.match(registration, /local_only_execution:\s*true/);
  assert.match(registration, /modal_fallback_allowed:\s*false/);
  assert.match(registration, /external_provider_fallback_allowed:\s*false/);
  assert.doesNotMatch(provider, /Modal|RunPod|runpod/);
});

test("current Cinema generation is the bounded Node01 LTX 2.5 lane", () => {
  assert.match(provider, /AvantiqoVideoLocalQueueProvider\.execute/);
  assert.match(provider, /STUDIO_VISUAL_GENERATION_MASTER_LOCKED/);
  assert.match(local, /CAPABILITY = "ai\.video\.generate"/);
  assert.match(local, /Lightricks\/LTX-2\.5/);
  assert.match(local, /AVANTIQO_LOCAL_NODE_V1/);
  assert.match(registration, /IMPLEMENTED_CAPABILITIES = Object\.freeze\(\[[\s\S]*"ai\.video\.generate"/);
  assert.match(registration, /allowed_duration_seconds: \[1, 8\]/);
  assert.match(registration, /default_generation_resolution: LOCAL_DEFAULT_RESOLUTION/);
});
