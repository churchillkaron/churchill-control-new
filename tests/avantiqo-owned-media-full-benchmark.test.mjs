import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("retired RunPod full-media benchmark remains absent",()=>{
  assert.equal(fs.existsSync("scripts/benchmark-avantiqo-owned-media-full.mjs"),false);
});

test("current local certification refuses to pretend advanced capability coverage",()=>{
  const core=fs.readFileSync("scripts/certify-avantiqo-owned-media-core-local.mjs","utf8");
  assert.match(core,/ENGINE_SPECIFIC_CERTIFICATION_REQUIRED/);
  assert.match(core,/generation_performed: false/);
  assert.match(core,/image_engine_certification_required: true/);
  assert.match(core,/cinema_engine_certification_required: true/);
  assert.match(core,/production_activation_performed: false/);
  assert.match(core,/production_deploy_performed: false/);
  assert.match(core,/process\.exitCode = 2/);
});

test("current provider registries expose only implemented certified capabilities",()=>{
  const video=fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoProviderRegistration.js","utf8");
  assert.match(video,/const IMPLEMENTED_CAPABILITIES = Object\.freeze\(\[\s*"ai\.video\.generate",\s*\]\)/s);
  assert.match(video,/const DEFAULT_CERTIFIED_CAPABILITIES = Object\.freeze\(\[\s*"ai\.video\.generate",\s*\]\)/s);
  assert.match(video,/local_only_execution: true/);
  assert.match(video,/modal_fallback_allowed: false/);
});
