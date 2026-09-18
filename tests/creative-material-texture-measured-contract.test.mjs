import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { CreativeMaterialLabRuntime } from '../lib/creative/materials/runtime/CreativeMaterialLabRuntime.js';
import { CreativeMeasuredMaterialLibraryRuntime } from '../lib/creative/materials/runtime/CreativeMeasuredMaterialLibraryRuntime.js';

const cycles=fs.readFileSync('lib/creative/rendering/runtime/CreativeCyclesProductionRenderRuntime.js','utf8');
const binding=fs.readFileSync('lib/creative/materials/runtime/CreativeMaterialTextureBindingRuntime.js','utf8');

test('measured automotive profile seeds physically meaningful clearcoat defaults',()=>{
  const profile=CreativeMeasuredMaterialLibraryRuntime.resolve({profile_id:'AUTOMOTIVE_METALLIC_CLEARCOAT'});
  assert.equal(profile.defaults.coat_weight,1);
  const lib=CreativeMaterialLabRuntime.author({materials:[{material_id:'paint',material_class:'AUTOMOTIVE_PAINT',measured_profile:{profile_id:'AUTOMOTIVE_METALLIC_CLEARCOAT'}}]});
  assert.equal(lib.status,'READY');
  assert.equal(lib.materials[0].coat_weight,1);
  assert.equal(lib.materials[0].measured_profile.profile_id,'AUTOMOTIVE_METALLIC_CLEARCOAT');
});

test('texture binder supports production PBR channels with provenance',()=>{
  assert.match(binding,/BASE_COLOR/);
  assert.match(binding,/ROUGHNESS/);
  assert.match(binding,/METALLIC/);
  assert.match(binding,/NORMAL/);
  assert.match(binding,/DISPLACEMENT/);
  assert.match(binding,/source_asset_node_id/);
  assert.match(binding,/checksum/);
});

test('Cycles shader graph consumes bound texture maps with correct semantic nodes',()=>{
  assert.match(cycles,/ShaderNodeTexImage/);
  assert.match(cycles,/ShaderNodeNormalMap/);
  assert.match(cycles,/ShaderNodeBump/);
  assert.match(cycles,/colorspace_settings\.name='sRGB'/);
  assert.match(cycles,/Non-Color/);
  assert.match(cycles,/CreativeMaterialTextureBindingRuntime\.bind/);
});
