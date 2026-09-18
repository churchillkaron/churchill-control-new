import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

const modal=fs.readFileSync('services/avantiqo-image-engine/modal_app.py','utf8');
const provider=fs.readFileSync('lib/platform/service-runtime/providers/avantiqo-image/AvantiqoImageProvider.js','utf8');
const registration=fs.readFileSync('lib/platform/service-runtime/providers/avantiqo-image/AvantiqoImageProviderRegistration.js','utf8');
const registry=fs.readFileSync('lib/creative/tools/registry/CreativeToolRegistry.js','utf8');

test('owned image modal runtime contains real 16-bit depth estimation function',()=>{
  assert.match(modal,/DEPTH_MODEL = "depth-anything\/Depth-Anything-V2-Small-hf"/);
  assert.match(modal,/def estimate_depth\(data: dict\[str, Any\]\)/);
  assert.match(modal,/AutoModelForDepthEstimation/);
  assert.match(modal,/creative\.depth\.estimate/);
  assert.match(modal,/mode="I;16"/);
  assert.match(modal,/"storage_reference": storage_reference/);
  assert.match(modal,/"raw_reasoning_persisted": False/);
});

test('Avantiqo image provider routes depth through dedicated async Modal function',()=>{
  assert.match(provider,/functionName: "estimate_depth"/);
  assert.match(provider,/modal-image-depth-direct:/);
  assert.match(provider,/capability === "creative\.depth\.estimate"/);
  assert.match(provider,/ownedImageDepthWorker\.execute/);
});

test('provider registry and creative tool registry advertise governed depth execution',()=>{
  assert.match(registration,/"creative\.depth\.estimate"/);
  assert.match(registration,/AVANTIQO_IMAGE_DEPTH_MODEL/);
  assert.match(registration,/owned_depth_estimation: true/);
  assert.match(registry,/DEPTH_ESTIMATE: "creative\.depth\.estimate"/);
  assert.match(registry,/CREATIVE_TOOL_CAPABILITIES\.DEPTH_ESTIMATE/);
});
