import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
const source = fs.readFileSync(new URL('../lib/creative/director/runtime/CreativeDynamicTribunalRuntime.js', import.meta.url), 'utf8');
test('fresh tribunal reviews enforce a bounded two-attempt schema contract', () => {
  assert.match(source, /for \(let schemaAttempt = 1; schemaAttempt <= 2; schemaAttempt \+= 1\)/);
  assert.match(source, /compactReviewSchemaRetryPayload\(\{ reviewer, plan, floor \}\)/);
  assert.match(source, /creative_reviewer_id: reviewerId/);
  assert.match(source, /creative_review_evidence_hash: evidenceHash/);
  assert.match(source, /creative_review_schema_attempt: schemaAttempt/);
  assert.match(source, /let acceptedOutput = null/);
  assert.match(source, /acceptedOutput = normalizedOutput/);
  assert.match(source, /review: acceptedOutput/);
});
