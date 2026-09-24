import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
const source = fs.readFileSync(new URL('../lib/creative/director/runtime/CreativeDynamicTribunalRuntime.js', import.meta.url), 'utf8');
test('narrative reviewer uses compact causal evidence instead of full concept payload', () => {
  assert.match(source, /function narrativePlanEvidence\(/);
  assert.match(source, /case "NARRATIVE":\s*return narrativePlanEvidence\(canonical\)/);
  assert.match(source, /causal_story: compactText/);
  assert.match(source, /hero_agency: compactJson/);
  assert.match(source, /governing_world_rule: compactText/);
  assert.doesNotMatch(source, /case "NARRATIVE":\s*return \{[\s\S]{0,180}concept: canonical\.concept/);
});
test('legacy pass migration requires at least seventy percent normalized evidence coverage', () => {
  assert.match(source, /function evidenceCoverageSupported\(/);
  assert.match(source, /tokens\.length < 5/);
  assert.match(source, /matched \/ tokens\.length >= 0\.7/);
});
