import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const certification=fs.readFileSync("lib/creative/video/runtime/CreativeVideoProductionCertificationRuntime.js","utf8");
const router=fs.readFileSync("lib/creative/video/runtime/CreativeVideoEngineRouter.js","utf8");
const registration=fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoProviderRegistration.js","utf8");

test("video certification is capability-level rather than blanket engine flag",()=>{
  assert.match(certification,/capability_level_certification:true/);
  assert.match(certification,/blanket_engine_certification_forbidden:true/);
  assert.match(router,/CreativeVideoProductionCertificationRuntime\.status/);
});

test("production certification truth matches current Node01 local generation architecture",()=>{
  assert.match(certification,/IMPLEMENTED=.*ai\.video\.generate/);
  assert.match(certification,/LOCAL_GENERATION_RESOLUTION="608x352"/);
  assert.match(certification,/delivery_resolution:LOCAL_GENERATION_RESOLUTION/);
  assert.match(certification,/local_only_execution:true/);
  assert.match(registration,/LOCAL_DEFAULT_RESOLUTION = "608x352"/);
  assert.match(registration,/implemented_capabilities: IMPLEMENTED_CAPABILITIES/);
  assert.match(registration,/local_only_execution: true/);
});

test("uncertified and unimplemented capabilities remain blocked",()=>{
  assert.match(certification,/status:!implemented\?"UNSUPPORTED":certified\?"PRODUCTION_CERTIFIED":"CERTIFICATION_REQUIRED"/);
  assert.match(certification,/unimplemented_delivery_upscale_must_block:true/);
  assert.match(router,/VIDEO_CAPABILITY_NOT_IMPLEMENTED/);
  assert.match(router,/status: "BLOCKED"/);
});

test("paid execution remains separate authority from capability certification",()=>{
  assert.match(certification,/paid_execution_requires_separate_authority:true/);
  assert.match(router,/paid_execution_authorized: false/);
});
