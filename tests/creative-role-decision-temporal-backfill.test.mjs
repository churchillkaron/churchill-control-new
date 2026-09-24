import assert from 'node:assert/strict';
import test from 'node:test';
import { applyDerivedRoleDecisions } from '../lib/creative/director/planner/creativeRoleDecisionDefaults.js';

test('legacy temporal film checkpoint derives production designer when physical world is already authored', () => {
  const roles = [{ id: 'production_designer', applies_to: ['TEMPORAL'] }];
  const plan = applyDerivedRoleDecisions({
    workflow_kind: 'TEMPORAL',
    concept: {
      title: 'The Breath After Stillness',
      visual_system: { world: 'A silent desert valley with stone, water, grass and a village well.' },
      environment_progression: 'Valley to well to distant city infrastructure.',
    },
    role_decisions: {},
  }, roles);
  assert.equal(plan.role_decisions.production_designer.status, 'ACTIVE');
  assert.equal(plan.role_decisions.production_designer.legacy_role_registry_backfill, true);
  assert.ok(plan.role_decisions.production_designer.evidence.length >= 1);
});

test('temporal production designer is not invented when no physical world evidence exists', () => {
  const roles = [{ id: 'production_designer', applies_to: ['TEMPORAL'] }];
  const plan = applyDerivedRoleDecisions({ workflow_kind: 'TEMPORAL', concept: {}, story: {}, role_decisions: {} }, roles);
  assert.equal(plan.role_decisions.production_designer, undefined);
});
