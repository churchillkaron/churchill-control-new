import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveTemporalCadenceContract } from '../lib/creative/director/validation/CreativeMasterPlanValidator.js';

function plan({ story, scenes, longTake = false }) {
  return {
    temporal_contract: {
      duration_seconds: 60,
      ...(longTake ? { long_take_strategy: { intentional: true } } : {}),
    },
    deliverables: [{ output_spec: { duration_seconds: 60 } }],
    concept: { creative_thesis: story },
    story: { audience_tension: story, escalation: story, emotional_arc: story },
    scenes,
  };
}

const threeMovements = [
  { objective: 'withhold the system', shots: [{ duration_seconds: 15 }] },
  { objective: 'expand the world', shots: [{ duration_seconds: 20 }] },
  { objective: 'reveal intelligence', shots: [{ duration_seconds: 25 }] },
];

test('60 second mystery chapter cannot collapse three narrative movements into three shots', () => {
  const cadence = deriveTemporalCadenceContract(plan({
    story: 'Build mystery, tension and anticipation through withholding before a late reveal.',
    scenes: threeMovements,
  }));
  assert.equal(cadence.duration_seconds, 60);
  assert.equal(cadence.shot_count, 3);
  assert.equal(cadence.minimum_shot_count, 10);
  assert.equal(cadence.pacing_signals.tension_driven, true);
  assert.equal(cadence.narrative_movements_are_not_shots, true);
});

test('cadence responds to patient cinema rather than using one fixed shot count', () => {
  const cadence = deriveTemporalCadenceContract(plan({
    story: 'Patient contemplative stillness and restrained human observation.',
    scenes: [
      { objective: 'observe place and weather', shots: [{ duration_seconds: 20 }] },
      { objective: 'stay with human detail', shots: [{ duration_seconds: 20 }] },
      { objective: 'resolve in quiet geography', shots: [{ duration_seconds: 20 }] },
    ],
  }));
  assert.equal(cadence.minimum_shot_count, 8);
  assert.equal(cadence.pacing_signals.patient, true);
});

test('explicit authored long take remains a valid exceptional form', () => {
  const cadence = deriveTemporalCadenceContract(plan({
    story: 'One continuous take with an unbroken evolving performance.',
    scenes: [{ objective: 'continuous progression', shots: [{ duration_seconds: 60 }] }],
    longTake: true,
  }));
  assert.equal(cadence.deliberate_long_take, true);
  assert.equal(cadence.minimum_shot_count, 4);
});
