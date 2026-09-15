import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync('lib/creative/quality/runtime/CreativeGeneratedMediaPerceptualExecutionGate.js', 'utf8');

test('async perceptual review polls re-run deterministic hold/fail validation', () => {
  assert.match(source, /const poll = ProductionTaskRuntime\.poll\.bind\(ProductionTaskRuntime\)/);
  assert.match(source, /ProductionTaskRuntime\.poll = async function pollWithGeneratedMediaPerceptualGate/);
  assert.match(source, /\? holdOrFail\(result\)/);
});
