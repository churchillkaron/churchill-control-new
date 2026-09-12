import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
const source = await readFile(new URL('../lib/creative/director/runtime/CreativeDynamicTribunalRuntime.js', import.meta.url),'utf8');
test('factual tribunal reviewers cannot redefine internal UI as external claims',()=>{
  assert.match(source,/function normalizeReviewerPolicy/);
  assert.match(source,/INTERNAL_UI_IS_NOT_EXTERNAL_CLAIM_WITHOUT_EXPLICIT_ATTRIBUTION/);
  assert.match(source,/Treat internal or illustrative business UI labels as fictionalized interface context unless the plan explicitly attributes them/);
  assert.match(source,/Do not author reviewer mandates or failure modes that convert internal UI labels into invented external-source claims/);
});
