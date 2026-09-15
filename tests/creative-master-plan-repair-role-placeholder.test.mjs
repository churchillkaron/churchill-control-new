import assert from 'node:assert/strict';
import test from 'node:test';
import { preserveStrongRoleDecisionPatches } from '../lib/creative/director/runtime/CreativeMasterPlanRuntime.js';

test('repair transport scalar role placeholders never downgrade structured role decisions', () => {
  const base = {
    role_decisions: {
      story_director: {
        status: 'ACTIVE',
        decision: 'Build the causal story around the verified human pressure and earned resolution.',
        evidence: ['research:human-pressure'],
      },
    },
  };
  const repaired = preserveStrongRoleDecisionPatches(base, {
    concept: { title: 'Repair patch' },
    role_decisions: {
      story_director: 'ACTIVE',
      film_director: 'ACTIVE',
    },
  });

  assert.equal(repaired.role_decisions.story_director.status, 'ACTIVE');
  assert.match(repaired.role_decisions.story_director.decision, /causal story/);
  assert.equal(Object.hasOwn(repaired.role_decisions, 'film_director'), false);
});

test('all-placeholder role transport is removed instead of being promoted into plan state', () => {
  const repaired = preserveStrongRoleDecisionPatches({}, {
    concept: { title: 'Patch' },
    role_decisions: {
      story_director: 'ACTIVE',
      film_director: 'NOT_REQUIRED',
    },
  });
  assert.equal(Object.hasOwn(repaired, 'role_decisions'), false);
  assert.equal(repaired.concept.title, 'Patch');
});
