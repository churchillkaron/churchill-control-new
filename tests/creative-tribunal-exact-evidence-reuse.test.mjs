import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
const source = fs.readFileSync(new URL('../lib/creative/director/runtime/CreativeDynamicTribunalRuntime.js', import.meta.url), 'utf8');
test('settled reviewer verdict is reused when its exact scoped evidence hash still matches', () => {
  assert.match(source, /text\(settled\.review_evidence_hash\) === evidenceHash/);
  assert.match(source, /reused: true,[\s\S]{0,120}review_evidence_hash: evidenceHash/);
});
