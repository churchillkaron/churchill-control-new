import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const tribunal=fs.readFileSync(new URL('../lib/creative/director/runtime/CreativeDynamicTribunalRuntime.js',import.meta.url),'utf8');
const workflow=fs.readFileSync(new URL('../lib/creative/director/runtime/CreativeWorkflowResolutionRuntime.js',import.meta.url),'utf8');
test('exact scoped failed Tribunal reviews are reused until evidence changes',()=>{
  assert.match(tribunal,/const exactScopedEvidenceMatch = text\(settled\?\.review_evidence_hash\) === evidenceHash/);
  assert.match(tribunal,/settled && \(exactScopedEvidenceMatch \|\| verifiedLegacyPass\)/);
});
test('recovery preserves failed reviews as durable blocker evidence',()=>{
  assert.match(workflow,/const settledByReviewer = new Map\(\)/);
  assert.match(workflow,/Keep the latest settled review for this exact plan evidence whether it passed or/);
  assert.doesNotMatch(workflow,/const passingByReviewer = new Map\(\)/);
});
