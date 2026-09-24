import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
const source = fs.readFileSync(new URL('../lib/creative/director/runtime/CreativeDynamicTribunalRuntime.js', import.meta.url), 'utf8');
test('human and rights reviewers use compact evidence-bearing contract from first attempt', () => {
  assert.match(source, /const compactFirstPass = \["HUMAN_PERFORMANCE", "RIGHTS_SAFETY"\]\.includes\(reviewerDiscipline\(reviewer\)\)/);
  assert.match(source, /const firstPayload = compactFirstPass[\s\S]{0,120}compactReviewSchemaRetryPayload\(\{ reviewer, plan, floor \}\)/);
});
test('compact evidence contract forbids nested quotation serialization', () => {
  const start = source.indexOf('function compactReviewSchemaRetryPayload');
  const end = source.indexOf('\nfunction comparableEvidenceText', start);
  const helper = source.slice(start, end);
  assert.match(helper, /return separate plain JSON strings/);
  assert.match(helper, /Do not wrap evidence text in extra quotation marks/);
  assert.match(helper, /do not serialize multiple evidence items into one string/);
});
