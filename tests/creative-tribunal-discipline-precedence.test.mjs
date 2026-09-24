import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
const source = fs.readFileSync(new URL('../lib/creative/director/runtime/CreativeDynamicTribunalRuntime.js', import.meta.url), 'utf8');

test('human performance discipline wins before broad authenticity matching', () => {
  const human = source.indexOf('return "HUMAN_PERFORMANCE"');
  const creative = source.indexOf('return "CREATIVE_AUTHENTICITY"');
  assert.ok(human > 0 && creative > 0 && human < creative);
});

test('rights safety discipline wins before broad brand matching', () => {
  const rights = source.indexOf('return "RIGHTS_SAFETY"');
  const brand = source.indexOf('return "BRAND_TRUTH"');
  assert.ok(rights > 0 && brand > 0 && rights < brand);
});
