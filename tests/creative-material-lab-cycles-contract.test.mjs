import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { CreativeMaterialLabRuntime } from '../lib/creative/materials/runtime/CreativeMaterialLabRuntime.js';

const cycles=fs.readFileSync('lib/creative/rendering/runtime/CreativeCyclesProductionRenderRuntime.js','utf8');

test('automotive paint requires clearcoat and carries microstructure',()=>{
  const library=CreativeMaterialLabRuntime.author({materials:[{material_id:'paint',material_class:'AUTOMOTIVE_PAINT',pbr:{base_color:[.1,.1,.12,1],metallic:.8,roughness:.18,coat_weight:1,coat_roughness:.06},microstructure:{metallic_flake_scale:140,metallic_flake_density:.65,orange_peel:.12,micro_scratches:.08,normal_strength:.18},continuity_key:'revuelto-paint'}]});
  assert.equal(library.status,'READY');
  assert.equal(library.materials[0].coat_weight,1);
  assert.equal(library.materials[0].microstructure.metallic_flake_density,.65);
});

test('carbon fibre requires a physical weave scale',()=>{
  const library=CreativeMaterialLabRuntime.author({materials:[{material_id:'cf',material_class:'CARBON_FIBER',pbr:{metallic:.2,roughness:.2},microstructure:{carbon_weave_scale:0}}]});
  assert.equal(library.status,'BLOCKED');
  assert.ok(library.blockers.some(x=>x.includes('CARBON_WEAVE_SCALE_REQUIRED')));
});

test('optical glass requires transmission and IOR',()=>{
  const library=CreativeMaterialLabRuntime.author({materials:[{material_id:'glass',material_class:'GLASS_OPTICAL',pbr:{ior:1.52,transmission:.95,roughness:.03}}]});
  assert.equal(library.status,'READY');
});

test('Cycles production renderer enables multilayer EXR and cinema AOVs',()=>{
  assert.match(cycles,/OPEN_EXR_MULTILAYER/);
  assert.match(cycles,/use_pass_z/);
  assert.match(cycles,/use_pass_normal/);
  assert.match(cycles,/use_pass_vector/);
  assert.match(cycles,/use_pass_cryptomatte_object/);
  assert.match(cycles,/use_pass_cryptomatte_material/);
  assert.match(cycles,/use_pass_diffuse_direct/);
  assert.match(cycles,/use_pass_glossy_direct/);
  assert.match(cycles,/use_pass_transmission_direct/);
});

test('Cycles production renderer consumes Material Lab and remains owned',()=>{
  assert.match(cycles,/CreativeMaterialLabRuntime\.author/);
  assert.match(cycles,/scene\.render\.engine='CYCLES'/);
  assert.match(cycles,/provider_calls_performed:false/);
  assert.match(cycles,/production_render:true/);
});
