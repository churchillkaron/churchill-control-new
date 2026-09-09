import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync(
  'scripts/build-creative-versioned-direction-approval-envelope-v3-read-only.mjs',
  'utf8',
);

test('V3 direction estimator uses duration-aware cinematic critique ceilings', () => {
  assert.match(source, /if \(duration <= 10\) return 1800/);
  assert.match(source, /if \(duration <= 30\) return 4200/);
  assert.match(source, /if \(duration <= 90\) return 6000/);
  assert.match(source, /max_output_tokens: cinematicCritiqueOutputTokens\(duration\)/);
});

test('V3 direction estimator still prices critique as a governed Deep review stage', () => {
  assert.match(source, /CREATIVE_CINEMATIC_IMPACT_CRITIQUE_V1/);
  assert.match(source, /stage: "CINEMATIC_CRITIQUE_MAX"/);
});
