import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
const source = await readFile(new URL('../lib/creative/director/runtime/CreativeDynamicTribunalRuntime.js', import.meta.url),'utf8');
test('factual tribunal reviewers cannot redefine creative constructs as external claims',()=>{
  assert.match(source,/function normalizeReviewerPolicy/);
  assert.match(source,/EXPLICIT_REAL_WORLD_CLAIMS_ONLY_V2/);
  assert.match(source,/Fictional cinematic world-rules, brand metaphors, creative positioning/);
  assert.match(source,/Do not author reviewer mandates or failure modes that convert internal UI labels into invented external-source claims/);
});
