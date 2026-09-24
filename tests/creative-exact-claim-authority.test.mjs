import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { groundCreativeExactClaims } from '../lib/creative/director/runtime/CreativeExactClaimAuthorityRuntime.js';

const samplePlan = () => ({
  workflow_kind: 'STILL',
  creative_system: 'Use #0A2463 with Helvetica and proof $2.3M.',
  deliverables: [{
    id: 'poster',
    output_spec: { typography: { tagline_font: 'Helvetica Regular, 24pt' }, color_palette: ['#0A2463', '#FFFFFF'], composition: 'Logo at bottom 10%. 80% negative space.' },
    production_steps: [{ output_spec: { position: 'bottom 10%' }, requirements: { font: 'Helvetica', color: '#0A2463', metric_value: '$2.3M', exact_placement: 'bottom 10%' } }],
  }],
});

test('removes unsupported exact brand and metric claims before Tribunal', () => {
  const grounded = groundCreativeExactClaims({ plan: samplePlan(), mission: { objective: 'Premium campaign poster' } });
  const body = JSON.stringify(grounded);
  assert.doesNotMatch(body, /#0A2463|#FFFFFF|Helvetica|\$2\.3M/i);
  assert.equal(grounded.deliverables[0].production_steps[0].requirements.metric_value, undefined);
  assert.match(body, /evidence-bound brand color|verified production font|design-defined safe area/);
  assert.match(grounded.deliverables[0].output_spec.composition, /80% negative space/);
});
test('preserves mission-explicit exact values', () => {
  const mission = { objective: 'Use #0A2463, Helvetica and the verified $2.3M metric exactly.' };
  const grounded = groundCreativeExactClaims({ plan: samplePlan(), mission });
  const body = JSON.stringify(grounded);
  assert.match(body, /#0A2463/);
  assert.match(body, /Helvetica/);
  assert.match(body, /\$2\.3M/);
});

test('preserves exact values from authoritative brand truth', () => {
  const plan = samplePlan();
  plan.brand_truth = {
    contract: 'CREATIVE_BRAND_TRUTH_V1',
    brand_truth_hash: 'truth-hash',
    brand_intelligence: { primary_color: '#0A2463', font_family: 'Helvetica' },
  };
  const grounded = groundCreativeExactClaims({ plan, mission: {} });
  const body = JSON.stringify(grounded);
  assert.match(body, /#0A2463/);
  assert.match(body, /Helvetica/);
});

test('grounds recovered plans and both Tribunal entry paths before review', () => {
  const source = fs.readFileSync(new URL('../lib/creative/director/runtime/CreativeWorkflowResolutionRuntime.js', import.meta.url), 'utf8');
  assert.equal((source.match(/CreativeExactClaimAuthorityRuntime\.ground\(/g) || []).length, 3);
  assert.match(source, /function normalizeRecoveredTribunalPlan/);
});
