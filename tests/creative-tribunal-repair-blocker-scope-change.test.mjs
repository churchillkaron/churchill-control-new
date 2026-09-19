import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
const source=fs.readFileSync(new URL('../lib/creative/director/runtime/CreativeDynamicTribunalRuntime.js',import.meta.url),'utf8');
test('Tribunal repair must change every blocking reviewer scoped evidence before re-review',()=>{
  assert.match(source,/unchangedBlockingReviewerEvidence/);
  assert.match(source,/reviewerPlanEvidence\(reviewer, beforePlan\)/);
  assert.match(source,/reviewerPlanEvidence\(reviewer, candidate\)/);
  assert.match(source,/CREATIVE_TRIBUNAL_REPAIR_BLOCKER_SCOPE_UNCHANGED/);
  assert.match(source,/rejected_repair_feedback/);
});
