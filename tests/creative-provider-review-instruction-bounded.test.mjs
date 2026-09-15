import test from 'node:test';
import assert from 'node:assert/strict';
import { serializeCreativeProviderInstruction } from '../lib/creative/execution/runtime/CreativeProviderInstructionSerializer.js';

test('perceptual review provider instruction is bounded and excludes full task payload', () => {
  const huge = 'x'.repeat(20000);
  const instruction = serializeCreativeProviderInstruction({
    capability: 'ai.image.analyze',
    node_type: 'QUALITY_REVIEW',
    requirements: {
      subject: 'A crystal on a wooden table',
      action: 'The crystal pulses',
      camera: 'Macro close-up',
      location: { name: 'Study', description: huge },
      continuity_bible: { world_identity: huge, hero_subject_identity: 'crystal' },
      negative_constraints: [huge, 'no warped geometry'],
    },
    metadata: { giant_internal_payload: huge },
    output_spec: { aspect_ratio: '16:9' },
  });
  assert.ok(instruction.length > 100);
  assert.ok(instruction.length <= 9000);
  assert.match(instruction, /Compact immutable review contract/);
  assert.doesNotMatch(instruction, /giant_internal_payload/);
  assert.doesNotMatch(instruction, new RegExp('x{5000}'));
});
