import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
const source = fs.readFileSync(new URL('../lib/creative/director/runtime/CreativeDynamicTribunalRuntime.js', import.meta.url), 'utf8');
test('tribunal preflight helpers invoked by review are defined', () => {
  assert.match(source, /function deterministicAntiClicheConceptBlocker\(/);
  assert.match(source, /function fatalConceptReplacementRequired\(/);
  assert.match(source, /function canonicalReviewerId\(/);
  assert.match(source, /let tribunal = deterministicAntiClicheConceptBlocker\(/);
  assert.match(source, /fatalConceptReplacementRequired\(tribunal\)/);
});
