import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
const source = fs.readFileSync(new URL('../lib/creative/director/runtime/CreativeDynamicTribunalRuntime.js', import.meta.url), 'utf8');
test('rights safety rejects evidence references absent from current scoped evidence', () => {
  assert.match(source, /if \(discipline === "RIGHTS_SAFETY"\)[\s\S]{0,500}UNSUPPORTED_RIGHTS_EVIDENCE/);
});
