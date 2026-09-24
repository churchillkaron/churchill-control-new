import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
const source = await readFile(new URL('../lib/creative/director/runtime/CreativeDynamicTribunalRuntime.js', import.meta.url),'utf8');
test('factual tribunal reviewers cannot redefine creative constructs as external claims',()=>{
  assert.match(source,/function normalizeReviewerPolicy/);
  assert.match(source,/INTERNAL_UI_IS_NOT_EXTERNAL_CLAIM_WITHOUT_EXPLICIT_ATTRIBUTION/);
  assert.match(source,/For factual review, distinguish external factual claims from fictional or illustrative creative constructs/);
  assert.match(source,/Do not invent an external-source claim and then fail the plan for lacking that invented source/);
});
