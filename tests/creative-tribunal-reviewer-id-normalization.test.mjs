import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('../lib/creative/director/runtime/CreativeDynamicTribunalRuntime.js',import.meta.url),'utf8');
test('Tribunal reviewer identity comparison is canonicalized',()=>{
  assert.match(source,/const reviewerId = canonicalReviewerId\(reviewer\.id\)/);
  assert.match(source,/const outputReviewerId = canonicalReviewerId\(output\.reviewer_id\)/);
  assert.match(source,/const normalizedOutput = \{ \.\.\.output, reviewer_id: reviewerId \}/);
  assert.match(source,/return \[canonicalReviewerId\(review\.reviewer_id\), \{/);
});
