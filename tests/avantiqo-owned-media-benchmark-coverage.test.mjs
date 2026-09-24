import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("retired monolithic owned-engine benchmark remains absent",()=>{
  assert.equal(fs.existsSync("scripts/benchmark-avantiqo-owned-engines.mjs"),false);
});

test("current certification boundary distinguishes target implementation and certification honestly",()=>{
  const video=fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoProviderRegistration.js","utf8");
  const image=fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-image/AvantiqoImageProviderRegistration.js","utf8");
  const core=fs.readFileSync("scripts/certify-avantiqo-owned-media-core-local.mjs","utf8");
  assert.match(video,/target_capabilities: TARGET_CAPABILITIES/);
  assert.match(video,/implemented_capabilities: IMPLEMENTED_CAPABILITIES/);
  assert.match(video,/certified_capabilities: capabilities/);
  assert.match(image,/target_capabilities: TARGET_CAPABILITIES/);
  assert.match(image,/implemented_capabilities: IMPLEMENTED_CAPABILITIES/);
  assert.match(core,/ENGINE_SPECIFIC_CERTIFICATION_REQUIRED/);
  assert.match(core,/production_certified: false/);
  assert.match(core,/fail_closed: true/);
});
