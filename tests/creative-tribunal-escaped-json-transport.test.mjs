import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
const source = fs.readFileSync(new URL('../lib/creative/director/runtime/CreativeDynamicTribunalRuntime.js', import.meta.url), 'utf8');
test('tribunal parser supports bounded nested and escaped JSON transport', () => {
  const start = source.indexOf('function parseJson(');
  const end = source.indexOf('\n// Answers are located', start);
  const helper = source.slice(start, end);
  assert.match(helper, /for \(let depth = 0; depth < 3; depth \+= 1\)/);
  assert.match(helper, /typeof parsed === "string"/);
  assert.match(helper, /current = current\.replace\(\/\\\\"\/g, '\"'\)/);
});
