import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

const provider=fs.readFileSync('lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoProviderV2.js','utf8');
const registration=fs.readFileSync('lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoProviderRegistration.js','utf8');
const flash=fs.readFileSync('lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoFlashVsrProvider.js','utf8');

test('canonical upscale route uses FlashVSR provider',()=>{
  assert.match(provider,/capability === "ai\.video\.upscale"/);
  assert.match(provider,/AvantiqoVideoFlashVsrProvider\.execute/);
});

test('upscale registration identifies FlashVSR rather than frame SR placeholder',()=>{
  assert.match(registration,/JunhaoZhuang\/FlashVSR-v1\.1/);
  assert.match(registration,/temporal_super_resolution_engine: "FlashVSR-v1\.1"/);
  assert.match(registration,/per_frame_independent_super_resolution_production_forbidden: true/);
  assert.doesNotMatch(registration,/caidas\/swin2SR/);
});

test('FlashVSR route is fail closed until explicitly configured and certified',()=>{
  assert.match(flash,/AVANTIQO_FLASHVSR_ENGINE_ENABLED/);
  assert.match(flash,/AVANTIQO_FLASHVSR_ENGINE_CERTIFIED/);
  assert.match(flash,/AVANTIQO_FLASHVSR_ENDPOINT_URL_REQUIRED/);
  assert.match(flash,/AVANTIQO_TEMPORAL_4K_MASTERING_V1/);
});

test('FlashVSR route requires temporal SR and rejects per-frame production semantics',()=>{
  assert.match(flash,/temporal_super_resolution:true/);
  assert.match(flash,/per_frame_independent_sr:false/);
});
