import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
const source=fs.readFileSync(new URL('../lib/creative/director/runtime/CreativeDynamicTribunalRuntime.js',import.meta.url),'utf8');
test('active Tribunal reviewer authority excludes historical failure modes',()=>{
  assert.match(source,/function activeReviewerAuthority/);
  const fn=source.slice(source.indexOf('function activeReviewerAuthority'),source.indexOf('function reviewerEvidenceHash'));
  assert.doesNotMatch(fn,/failure_modes:/);
  assert.match(source,/reviewer: activeReviewerAuthority\(reviewer\)/);
  assert.match(source,/reviewer: activeReviewer,/);
});
test('Tribunal explicitly forbids treating historical panel failures as current evidence',()=>{
  assert.match(source,/historical risk-selection context, never proof/);
  assert.match(source,/absent from reviewer_scoped_evidence and the current canonical plan/);
});
