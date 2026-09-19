import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync(
  new URL('../lib/creative/director/runtime/CreativeMasterPlanRuntime.js', import.meta.url),
  'utf8',
);

test('master plan normalization prefers execution output over nested provider output envelope', () => {
  assert.match(source, /const output = result\?\.output \|\| result \|\| \{\};/);
  assert.doesNotMatch(source, /result\?\.output\?\.output \|\| result\?\.output/);
});
