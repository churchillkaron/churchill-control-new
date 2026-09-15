import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { normalizeCreativeStillPlan } from '../lib/creative/director/runtime/CreativeStillPlanNormalizationRuntime.js';

test('still production steps cannot require temporal transformation', () => {
  const plan = normalizeCreativeStillPlan({
    workflow_kind: 'STILL',
    concept: { title: 'Grid', signature_device: 'Light Grid', visual_system: { editing_language: 'progression across five images' } },
    deliverables: [{ id: 'poster', production_steps: [{ id: 'one', requirements: { selected_signature_device: 'Light Grid' }, output_spec: { narrative_structure: "The environment's transformation is triggered by moving objects." } }] }],
  });
  const narrative = plan.deliverables[0].production_steps[0].output_spec.narrative_structure;
  assert.match(narrative, /Static one-frame representation/);
  assert.match(narrative, /no animation, object movement or temporal transformation/);
  assert.match(plan.concept.visual_system.editing_language, /single still composition/);
});

test('temporal work is untouched', () => {
  const input = { workflow_kind: 'TEMPORAL', concept: { visual_system: { editing_language: 'cut' } }, deliverables: [] };
  assert.equal(normalizeCreativeStillPlan(input), input);
});

test('workflow normalizes still plans on both Tribunal entry paths', () => {
  const source = fs.readFileSync(new URL('../lib/creative/director/runtime/CreativeWorkflowResolutionRuntime.js', import.meta.url), 'utf8');
  assert.equal((source.match(/CreativeStillPlanNormalizationRuntime\.normalize\(/g) || []).length, 2);
});
