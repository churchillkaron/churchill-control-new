import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { groundCreativeExactClaims } from '../lib/creative/director/runtime/CreativeExactClaimAuthorityRuntime.js';

const samplePlan = () => ({
  workflow_kind: 'STILL',
  concept: { creative_system: 'Use Avantiqo blue #0A2463 and Helvetica.' },
  deliverables: [{
    id: 'poster',
    output_spec: { typography: { tagline_font: 'Helvetica Regular, 24pt' }, color_palette: ['#0A2463', '#FFFFFF'], composition: 'Logo at bottom 10%. 80% negative space.' },
    production_steps: [{ output_spec: { position: 'bottom 10%' }, requirements: { font: 'Helvetica', color: '#0A2463', metric_value: '$2.3M', exact_placement: 'bottom 10%' } }],
  }],
});

test('grounds unsupported exact brand, metric and placement claims', () => {
  const grounded = groundCreativeExactClaims({ plan: samplePlan(), mission: { objective: 'Premium campaign poster' } });
  const body = JSON.stringify(grounded);
  assert.doesNotMatch(body, /#0A2463|#FFFFFF|Helvetica|\$2\.3M|bottom 10%/i);
  assert.equal(grounded.deliverables[0].production_steps[0].requirements.metric_value, undefined);
  assert.match(body, /creative palette color \(not claimed as an official brand color\)|deterministic production typeface \(not claimed as an official brand font\)|design-defined safe area/);
  assert.match(grounded.deliverables[0].output_spec.composition, /80% negative space/);
});

test('preserves exact values explicitly authorized by mission', () => {
  const mission = { objective: 'Use #0A2463, #FFFFFF, Helvetica, $2.3M and bottom 10% exactly.' };
  const grounded = groundCreativeExactClaims({ plan: samplePlan(), mission });
  const body = JSON.stringify(grounded);
  assert.match(body, /#0A2463/);
  assert.match(body, /Helvetica/);
  assert.match(body, /\$2\.3M/);
  assert.match(body, /bottom 10%/);
});

test('workflow grounds claims on both Tribunal entry paths', () => {
  const source = fs.readFileSync(new URL('../lib/creative/director/runtime/CreativeWorkflowResolutionRuntime.js', import.meta.url), 'utf8');
  assert.equal((source.match(/CreativeExactClaimAuthorityRuntime\.ground\(/g) || []).length, 2);
});


test('neutralizes legacy false-authority placeholders even after exact tokens are gone', () => {
  const plan = {
    concept: { creative_system: 'Use evidence-bound brand color with verified production font.' },
    proof: 'verified business proof',
  };
  const grounded = groundCreativeExactClaims({ plan, mission: { objective: 'Premium campaign poster' } });
  const body = JSON.stringify(grounded);
  assert.doesNotMatch(body, /evidence-bound brand color|verified production font/i);
  assert.doesNotMatch(body, /\"verified business proof\"/i);
  assert.match(body, /not claimed as an official brand color/);
  assert.match(body, /not claimed as an official brand font/);
  assert.match(body, /source-verified business proof required before release/);
});


test('removes brand ownership from unverified named palette colors', () => {
  const plan = {
    concept: {
      creative_system: 'Use Avantiqo blue (creative palette color (not claimed as an official brand color)) as the dominant field.',
    },
  };
  const grounded = groundCreativeExactClaims({ plan, mission: { objective: 'Premium campaign poster' } });
  const body = JSON.stringify(grounded);
  assert.doesNotMatch(body, /Avantiqo blue/i);
  assert.match(body, /creative palette blue \(not claimed as an official brand color\)/i);
});


test('neutralizes legacy named palette variants and placement verification fields', () => {
  const plan = {
    concept: { creative_system: 'Use exact Avantiqo blue creative palette color (not claimed as an official brand color).' },
    quality: { logo_placement_verification: 'Bottom 10% (Feed) / 5% (Story)' },
  };
  const grounded = groundCreativeExactClaims({ plan, mission: { objective: 'Premium campaign poster' } });
  const body = JSON.stringify(grounded);
  assert.doesNotMatch(body, /Avantiqo blue|Bottom 10%|5% \(Story\)/i);
  assert.match(body, /creative palette blue \(not claimed as an official brand color\)/i);
  assert.match(grounded.quality.logo_placement_verification, /design-defined safe area/i);
});
