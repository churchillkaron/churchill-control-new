import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
const source = fs.readFileSync(new URL('../lib/creative/director/runtime/CreativeWorkflowResolutionRuntime.js', import.meta.url), 'utf8');
test('explicit tribunal panel skips historical paid-ledger recovery', () => {
  assert.match(source, /explicitTribunalReviewState = Array\.isArray\(input\.review_panel\?\.reviewers\)/);
  assert.match(source, /recoveredTribunalResume = lineageRecovery \|\| explicitTribunalReviewState\s*\? null\s*:\s*await recoverSettledTribunalResume/);
  assert.match(source, /review_panel: input\.review_panel \|\|/);
  assert.match(source, /settled_reviews: input\.settled_reviews \|\|/);
});
