import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const bake=fs.readFileSync('lib/creative/materials/runtime/CreativeMaterialBakeRuntime.js','utf8');
const cycles=fs.readFileSync('lib/creative/rendering/runtime/CreativeCyclesProductionRenderRuntime.js','utf8');
const color=fs.readFileSync('lib/creative/color/runtime/CreativeColorFinishingRuntime.js','utf8');

test('material bake supports production Blender bake maps and selected-to-active workflow',()=>{
  assert.match(bake,/AO/); assert.match(bake,/NORMAL/); assert.match(bake,/ROUGHNESS/); assert.match(bake,/DIFFUSE/); assert.match(bake,/EMIT/); assert.match(bake,/POSITION/); assert.match(bake,/UV/);
  assert.match(bake,/use_selected_to_active/);
  assert.match(bake,/smart_project/);
  assert.match(bake,/OPEN_EXR/);
  assert.match(bake,/checksum/);
});

test('Cycles chooses GPU backends when available and falls back to CPU',()=>{
  assert.match(cycles,/OPTIX/); assert.match(cycles,/CUDA/); assert.match(cycles,/HIP/); assert.match(cycles,/ONEAPI/); assert.match(cycles,/METAL/);
  assert.match(cycles,/scene\.cycles\.device='GPU'/);
  assert.match(cycles,/selected_device='CPU'/);
});

test('live Color DI resolves and seals single-authority scene-linear color management',()=>{
  assert.match(color,/CreativeColorManagementAuthorityRuntime\.resolve/);
  assert.match(color,/COLOR_MANAGEMENT_AUTHORITY_BLOCKED/);
  assert.match(color,/color_management_pipeline_hash/);
  assert.match(color,/color_management_working_space/);
  assert.match(color,/color_management_single_final_authority: true/);
});
