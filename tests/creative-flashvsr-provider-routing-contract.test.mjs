import fs from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";

const provider=fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoProviderV2.js","utf8");
const registration=fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoProviderRegistration.js","utf8");
const flash=fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoFlashVsrProvider.js","utf8");

test("canonical local Video provider fails closed for uncertified upscale",()=>{
  assert.match(provider,/ADVANCED_CAPABILITIES/);
  assert.match(provider,/"ai\.video\.upscale"/);
  assert.match(provider,/AVANTIQO_VIDEO_LOCAL_CAPABILITY_NOT_IMPLEMENTED/);
  assert.doesNotMatch(provider,/AvantiqoVideoFlashVsrProvider\.execute/);
});

test("registration retains FlashVSR as a target model without claiming live local capability",()=>{
  assert.match(registration,/JunhaoZhuang\/FlashVSR-v1\.1/);
  assert.match(registration,/implemented_capabilities: IMPLEMENTED_CAPABILITIES/);
  assert.match(registration,/owned_super_resolution: false/);
  assert.match(registration,/temporal_super_resolution_engine: null/);
  assert.match(registration,/per_frame_independent_super_resolution_production_forbidden: true/);
});

test("retained FlashVSR adapter remains fail closed until explicitly configured and certified",()=>{
  assert.match(flash,/AVANTIQO_FLASHVSR_ENGINE_ENABLED/);
  assert.match(flash,/AVANTIQO_FLASHVSR_ENGINE_CERTIFIED/);
  assert.match(flash,/AVANTIQO_FLASHVSR_ENDPOINT_URL_REQUIRED/);
  assert.match(flash,/AVANTIQO_TEMPORAL_4K_MASTERING_V1/);
});
