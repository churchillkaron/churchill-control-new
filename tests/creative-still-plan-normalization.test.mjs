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
  assert.equal((source.match(/CreativeStillPlanNormalizationRuntime\.normalize\(/g) || []).length, 1);
  assert.match(source, /function normalizeRecoveredTribunalPlan/);
  assert.equal((source.match(/normalizeRecoveredTribunalPlan\(/g) || []).length, 3);
});


test('still plans reconcile temporal lighting and refused physical metaphors from their own signature device', () => {
  const plan = normalizeCreativeStillPlan({
    workflow_kind: 'STILL',
    concept: {
      title: 'Grid',
      hook: 'A stable field with no human elements or physical objects.',
      signature_device: 'Light Grid',
      refused_devices: ['Desk, documents, or physical objects'],
      signature_images: ['Modular blocks forming into order'],
      visual_system: {
        lighting_language: 'Chaotic shadows → even light → uniform serene lighting (showing progression within single image)',
        production_approach: 'AI-generated digital physical objects simulation',
      },
    },
    deliverables: [],
  });
  const body = JSON.stringify(plan);
  assert.match(JSON.stringify(plan.concept.refused_devices), /physical objects/i);
  assert.doesNotMatch(JSON.stringify({ signature_images: plan.concept.signature_images, visual_system: plan.concept.visual_system }), /modular blocks|digital physical objects simulation/i);
  assert.match(body, /Abstract Light Grid composition/);
  assert.match(plan.concept.visual_system.lighting_language, /Static final-state lighting: uniform serene lighting/);
  assert.doesNotMatch(plan.concept.visual_system.lighting_language, /progression within single image/i);
});


test('still plans remove residual block metaphors and temporal camera or production wording', () => {
  const plan = normalizeCreativeStillPlan({
    workflow_kind: 'STILL',
    concept: {
      title: 'Grid',
      hook: 'No physical objects.',
      signature_device: 'Light Grid',
      refused_devices: ['physical objects'],
      signature_images: ['Blocks in chaotic arrangement', 'Stable modular structure'],
      production_approach: 'All changes occur within a single continuous image.',
      visual_system: {
        camera_language: 'Static angle emphasizing transformation and natural evolution.',
        production_approach: 'A sequence evolves into the final frame.',
      },
    },
    deliverables: [],
  });
  const body = JSON.stringify(plan);
  assert.doesNotMatch(JSON.stringify(plan.concept.signature_images), /blocks|modular structure/i);
  assert.match(plan.concept.visual_system.camera_language, /Static camera and fixed composition/);
  assert.match(plan.concept.production_approach, /Static generated Light Grid composition/);
  assert.doesNotMatch(body, /natural evolution|all changes occur|sequence evolves/i);
});


test('still recovery removes stale physical metaphors from strategy director guidance', () => {
  const plan = normalizeCreativeStillPlan({
    workflow_kind: 'STILL',
    concept: {
      title: 'Grid',
      hook: 'No physical objects.',
      signature_device: 'Light Grid',
      refused_devices: ['physical objects'],
      visual_system: {},
    },
    directors: {
      strategy_director: {
        risks: ["Overcomplicating the modular blocks' physical manifestation"],
        repair_instructions: ['Condense into a stable modular structure', 'Replace desk with abstract modular blocks'],
      },
    },
    deliverables: [],
  });
  const strategy = JSON.stringify(plan.directors.strategy_director);
  assert.doesNotMatch(strategy, /modular blocks|modular structure/i);
  assert.match(strategy, /Abstract Light Grid composition/);
});
