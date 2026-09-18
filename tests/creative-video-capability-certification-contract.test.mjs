import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const certification=fs.readFileSync('lib/creative/video/runtime/CreativeVideoProductionCertificationRuntime.js','utf8');
const router=fs.readFileSync('lib/creative/video/runtime/CreativeVideoEngineRouter.js','utf8');
const registration=fs.readFileSync('lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoProviderRegistration.js','utf8');

test('video certification is capability-level rather than blanket engine flag',()=>{
  assert.match(certification,/capability_level_certification:true/);
  assert.match(certification,/blanket_engine_certification_forbidden:true/);
  assert.match(router,/CreativeVideoProductionCertificationRuntime\.status/);
});

test('default production architecture is 1920x1088 generation plus 3840x2160 delivery',()=>{
  assert.match(certification,/generation_resolution:"1920x1088"/);
  assert.match(certification,/normalized_shot_resolution:"1920x1080"/);
  assert.match(certification,/delivery_resolution:"3840x2160"/);
  assert.match(registration,/FAST_PRODUCTION_RESOLUTION = "1920x1088"/);
  assert.match(registration,/DELIVERY_MASTER_RESOLUTION = "3840x2160"/);
  assert.match(registration,/hero_native_generation_default: false/);
});

test('uncertified capability remains benchmark-only even if implemented',()=>{
  assert.match(certification,/certified\?"PRODUCTION_CERTIFIED":"CERTIFICATION_REQUIRED"/);
  assert.match(certification,/execution_scope:certified\?"PRODUCTION_MASTERED":"BENCHMARK_REVIEW_PREVIEW"/);
});

test('unsupported video capability is blocked fail closed',()=>{
  assert.match(router,/VIDEO_CAPABILITY_NOT_IMPLEMENTED/);
  assert.match(router,/status: "BLOCKED"/);
});

test('paid execution remains a separate authority from capability certification',()=>{
  assert.match(certification,/paid_execution_requires_separate_authority:true/);
  assert.match(router,/paid_execution_authorized: false/);
});
