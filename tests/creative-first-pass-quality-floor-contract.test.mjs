import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

const read = (path) => fs.readFileSync(path, 'utf8');
const planner = read('lib/creative/director/runtime/CreativeTemporalMasterPlanRuntime.js');
const validator = read('lib/creative/director/validation/CreativeMasterPlanValidator.js');
const registry = read('lib/creative/director/registry/CreativeMasterPlanContractRegistry.js');

test('temporal Studio authors the quality floor before generation', () => {
  assert.match(planner, /FIRST-PASS QUALITY FLOOR/);
  assert.match(planner, /Do not rely on downstream reviewers/);
  assert.match(planner, /first_pass_intent/);
  assert.match(planner, /story_delta/);
  assert.match(planner, /visible_event/);
  assert.match(planner, /edit_reason/);
  assert.match(planner, /continuity_anchor/);
  assert.match(planner, /sound_picture_event/);
  assert.match(planner, /predicted_failure/);
  assert.match(planner, /Math\.min\(40/);
  assert.match(planner, /Premium\/high-budget work may require many more purposeful shots/);
});

test('first-pass intent is release-blocking master-plan structure', () => {
  assert.match(validator, /const firstPassIntent = object\(shot\.first_pass_intent\)/);
  assert.match(validator, /first_pass_intent\.\$\{field\}/);
  assert.match(registry, /Mandatory pre-generation self-critique record/);
  assert.match(registry, /downstream review is a backstop, not the authoring mechanism/);
});

test('deterministic recovery keeps first-pass quality semantics', () => {
  assert.match(planner, /first_pass_intent: object\(shot\.first_pass_intent\)/);
  assert.match(planner, /This cause-side angle gives the following consequence shot a motivated cut point/);
  assert.match(planner, /This consequence-side angle completes the causal edit pair/);
  assert.match(planner, /Reject generic office montage, posed performance, floating camera, identity drift/);
});
