import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTemporalMechanicalContract } from '../lib/creative/director/runtime/CreativeTemporalMechanicalNormalizationRuntime.js';

test('temporal mechanical normalization expands shallow continuity.product absence', () => {
  const plan = {
    workflow_kind: 'TEMPORAL',
    temporal_contract: { duration_seconds: 4 },
    deliverables: [{ id: 'master', output_spec: { duration_seconds: 4, aspect_ratio: '16:9', resolution: '4K', frame_rate: 24 } }],
    concept: {}, story: {}, creative_review: {},
    scenes: [{ id: 'scene1', duration_seconds: 4, products: [], location: { name: 'Tokyo street' }, actors: [], shots: [{
      id: 'shot1', duration_seconds: 4, subject: 'street lattice', action: 'ripple reveals infrastructure',
      frame_plan: { opening_frame: 'Street lattice before the ripple begins.', closing_frame: 'Infrastructure is visible beneath the street.' },
      camera: {}, production_design: {}, audio: {},
      continuity: { product: 'None' },
      generation: { service: 'ai.video.generate', capability: 'ai.video.generate', output_spec: { duration_seconds: 4 } },
    }] }],
  };
  const normalized = normalizeTemporalMechanicalContract(plan, { duration_seconds: 4, assets: [] });
  const product = normalized.scenes[0].shots[0].continuity.product;
  assert.notEqual(product, 'None');
  assert.match(product, /No separate product/i);
});
