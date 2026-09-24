import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
const source = fs.readFileSync(new URL('../lib/creative/director/runtime/CreativeDynamicTribunalRuntime.js', import.meta.url), 'utf8');
test('passed review migration validates current scoped evidence instead of stale forbidden words', () => {
  const start = source.indexOf('function passedReviewSafeToReuseAfterRepair(');
  const end = source.indexOf('\nasync function runReviews(', start);
  const helper = source.slice(start, end);
  assert.match(helper, /const citedEvidence = list\(review\.evidence_used\)/);
  assert.match(helper, /evidenceCoverageSupported\(evidence, scopedEvidenceText, planText, reviewerAuthorityText\)/);
  assert.match(helper, /assertReviewAuthority\(\{ reviewer, review, plan \}\)/);
  assert.doesNotMatch(helper, /const forbidden/);
  assert.doesNotMatch(helper, /"ripple"/);
});
