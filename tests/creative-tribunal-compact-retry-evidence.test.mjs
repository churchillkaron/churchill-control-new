import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
const source = fs.readFileSync(new URL('../lib/creative/director/runtime/CreativeDynamicTribunalRuntime.js', import.meta.url), 'utf8');
test('compact reviewer retry includes the current scoped evidence packet', () => {
  const start = source.indexOf('function compactReviewSchemaRetryPayload');
  const end = source.indexOf('\nfunction comparableEvidenceText', start);
  const helper = source.slice(start, end);
  assert.match(helper, /reviewer_scoped_evidence: reviewerPlanEvidence\(reviewer, plan\)/);
  assert.match(helper, /Every evidence_used entry must identify concrete content that is actually present in reviewer_scoped_evidence/);
  assert.match(helper, /Do not invent filenames, asset ids, rights records, locations, people, symbols, provenance or legal facts/);
});
