import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

const opencv=fs.readFileSync('lib/creative/tools/runtime/CreativeOpenCVRuntime.js','utf8');
const registry=fs.readFileSync('lib/creative/tools/registry/CreativeToolRegistry.js','utf8');
const geometry=fs.readFileSync('lib/creative/reconstruction/runtime/CreativeDepthGeometryProxyRuntime.js','utf8');
const modal=fs.readFileSync('services/avantiqo-image-engine/modal_app.py','utf8');
const provider=fs.readFileSync('lib/platform/service-runtime/providers/avantiqo-image/AvantiqoImageProvider.js','utf8');
const registration=fs.readFileSync('lib/platform/service-runtime/providers/avantiqo-image/AvantiqoImageProviderRegistration.js','utf8');

test('surface normals and practical-light estimation are deterministic OpenCV operations',()=>{
  assert.match(opencv,/DEPTH_NORMALS/);
  assert.match(opencv,/def depth_normals\(\)/);
  assert.match(opencv,/SURFACE_NORMAL_MAP/);
  assert.match(opencv,/PRACTICAL_LIGHTS/);
  assert.match(opencv,/def practical_lights\(\)/);
  assert.match(opencv,/PRACTICAL_LIGHT_MAP/);
  assert.match(registry,/CREATIVE_TOOL_CAPABILITIES\.NORMAL_ESTIMATE/);
  assert.match(registry,/CREATIVE_TOOL_CAPABILITIES\.PRACTICAL_LIGHT_ESTIMATE/);
});

test('single-view geometry proxy is real but explicitly bounded',()=>{
  assert.match(geometry,/CREATIVE_DEPTH_GEOMETRY_PROXY_V1/);
  assert.match(geometry,/SINGLE_VIEW_DEPTH_REPROJECTION_PROXY/);
  assert.match(geometry,/metric_scale_resolved.*False/);
  assert.match(geometry,/large_orbit_allowed.*False/);
  assert.match(geometry,/maximum_recommended_frame_translation_ratio/);
  assert.match(registry,/id: "depth-geometry-proxy"/);
  assert.match(registry,/SINGLE_VIEW_RELATIVE_GEOMETRY_ONLY_NO_FAKE_PHOTOGRAMMETRY/);
});

test('semantic material estimation is an owned governed vision capability',()=>{
  assert.match(modal,/def estimate_materials\(data: dict\[str, Any\]\)/);
  assert.match(modal,/AVANTIQO_MATERIAL_ESTIMATION_V1/);
  assert.match(modal,/roughness_estimate/);
  assert.match(modal,/metallic_estimate/);
  assert.match(provider,/functionName: "estimate_materials"/);
  assert.match(provider,/creative\.materials\.estimate/);
  assert.match(registration,/"creative\.materials\.estimate"/);
  assert.match(registration,/owned_material_estimation: true/);
  assert.match(registry,/CREATIVE_TOOL_CAPABILITIES\.MATERIAL_ESTIMATE/);
});
