import test from 'node:test';
import assert from 'node:assert/strict';
import { applyDerivedRoleDecisions } from '../lib/creative/director/planner/creativeRoleDecisionDefaults.js';
import { CREATIVE_MASTER_PLAN_ROLES } from '../lib/creative/director/registry/CreativeAgencyRoleRegistry.js';

test('backfills newly required Still agency role decisions on persisted plans', () => {
  const plan = applyDerivedRoleDecisions({
    workflow_kind: 'STILL',
    deliverables: [{ id: 'poster', type: 'Poster', output_spec: { composition: 'logo at bottom', typography: { tagline_font: 'verified font' } } }],
    role_decisions: {},
  }, CREATIVE_MASTER_PLAN_ROLES);
  assert.equal(plan.role_decisions.graphic_design_director.status, 'ACTIVE');
  assert.equal(plan.role_decisions.typography_director.status, 'ACTIVE');
  assert.equal(plan.role_decisions.image_retouching_director.status, 'NOT_REQUIRED');
});
