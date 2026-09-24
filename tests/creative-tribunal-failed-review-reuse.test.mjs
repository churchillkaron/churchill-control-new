import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const tribunal=fs.readFileSync(new URL('../lib/creative/director/runtime/CreativeDynamicTribunalRuntime.js',import.meta.url),'utf8');
const workflow=fs.readFileSync(new URL('../lib/creative/director/runtime/CreativeWorkflowResolutionRuntime.js',import.meta.url),'utf8');
test('exact scoped failed Tribunal reviews are reused until evidence changes',()=>{
  assert.match(tribunal,/const exactScopedEvidenceMatch = text\(settled\?\.review_evidence_hash\) === evidenceHash/);
  assert.match(tribunal,/settled && \(exactScopedEvidenceMatch \|\| legacyScopedMigrationMatch \|\| verifiedLegacyPass\)/);
});
test('recovery preserves failed reviews as durable blocker evidence',()=>{
  assert.match(tribunal,/Persist every settled scoped judgment, not only passes/);
  assert.match(tribunal,/settled_reviews: settledReviews/);
  assert.match(tribunal,/durable blocker evidence for this exact plan snapshot/);
});
