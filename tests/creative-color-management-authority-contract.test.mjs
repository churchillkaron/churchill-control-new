import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { CreativeColorManagementAuthorityRuntime } from '../lib/creative/color/runtime/CreativeColorManagementAuthorityRuntime.js';

test('scene-linear color management resolves common cinema camera inputs',()=>{
  for(const profile of ['ARRI_LOGC4','SONY_SLOG3_SGAMUT3CINE','RED_LOG3G10_RWGRGB','ACESCG','REC709']){
    const plan=CreativeColorManagementAuthorityRuntime.resolve({input_profile:profile,output_target:'REC709_SDR'});
    assert.equal(plan.status,'READY');
    assert.equal(plan.working_space.scene_referred,true);
  }
});

test('HDR output fails closed without verified OCIO or ACES configuration',()=>{
  const plan=CreativeColorManagementAuthorityRuntime.resolve({input_profile:'ARRI_LOGC4',output_target:'REC2020_PQ'});
  assert.equal(plan.status,'BLOCKED');
  assert.ok(plan.blockers.some(x=>x.includes('COLOR_HDR_OCIO_ACES_CONFIG_REQUIRED')));
});

test('HDR output unlocks with explicit color configuration authority',()=>{
  const plan=CreativeColorManagementAuthorityRuntime.resolve({input_profile:'ARRI_LOGC4',output_target:'REC2020_PQ',ocio_config_id:'aces-1.3-studio'});
  assert.equal(plan.status,'READY');
});

test('professional finishing contains no independent colorbalance or contrast/saturation grade',()=>{
  const source=fs.readFileSync('lib/creative/post-production/runtime/CreativeProfessionalFinishingRuntime.js','utf8');
  const match=source.match(/function gradeFilters\(shot = \{\}\) \{([\s\S]*?)\n\}/);
  assert.ok(match);
  assert.doesNotMatch(match[1],/colorbalance=/);
  assert.doesNotMatch(match[1],/eq=contrast=/);
  assert.match(match[1],/return \[\]/);
});

test('global Color DI remains the only grade/render authority',()=>{
  const source=fs.readFileSync('lib/creative/color/runtime/CreativeColorFinishingRuntime.js','utf8');
  assert.match(source,/function gradeFilters\(grade = \{\}, lutPath = null\)/);
  assert.match(source,/lut3d=/);
  assert.match(source,/colorspaceFilter/);
});
