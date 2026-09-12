import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
const source=await readFile(new URL('../lib/creative/director/runtime/CreativeDynamicTribunalRuntime.js',import.meta.url),'utf8');
test('tribunal rejects factual reviewer outputs that invent an external publication claim',()=>{
  assert.match(source,/function assertReviewAuthority/);
  assert.match(source,/CREATIVE_TRIBUNAL_REVIEW_AUTHORITY_VIOLATION/);
  assert.match(source,/INVENTED_EXTERNAL_CLAIM/);
  assert.match(source,/assertReviewAuthority\(\{ reviewer, review: output, plan \}\)/);
});
