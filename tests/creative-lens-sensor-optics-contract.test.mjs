import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { CreativeLensSensorProfileRuntime } from '../lib/creative/post-production/runtime/CreativeLensSensorProfileRuntime.js';

const optical=fs.readFileSync('lib/creative/post-production/runtime/CreativeOpticalFinishingRuntime.js','utf8');

test('post-safe lens/sensor optics resolve without render-time blockers',()=>{
  const p=CreativeLensSensorProfileRuntime.resolve({profile:{k1:-.02,k2:.006,halation_strength:.04,bloom_strength:.06,sensor:{grain_strength:3}}});
  assert.equal(p.status,'READY');
  assert.equal(p.policy.color_grade_forbidden,true);
});

test('focus breathing, bokeh, shutter and anamorphic behavior require render evidence',()=>{
  const p=CreativeLensSensorProfileRuntime.resolve({profile:{focus_breathing_percent:3,bokeh_blades:9,anamorphic_squeeze:2,shutter:{angle_degrees:90}}});
  assert.equal(p.status,'BLOCKED');
  assert.ok(p.blockers.includes('OPTICAL_FOCUS_BREATHING_RENDER_STAGE_REQUIRED'));
  assert.ok(p.blockers.includes('OPTICAL_BOKEH_RENDER_STAGE_REQUIRED'));
  assert.ok(p.blockers.includes('OPTICAL_ANAMORPHIC_RENDER_STAGE_REQUIRED'));
  assert.ok(p.blockers.includes('OPTICAL_SHUTTER_RENDER_STAGE_REQUIRED'));
});

test('optical finishing separates bloom and red-channel halation',()=>{
  assert.match(optical,/halation_sigma/);
  assert.match(optical,/halation_strength/);
  assert.match(optical,/lutrgb=g=0:b=0/);
  assert.match(optical,/lens_sensor_profile_hash/);
});
