import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const governor = fs.readFileSync('lib/operator/runtime/IntelligenceMemoryGovernorPolicy.js', 'utf8');
const budget = fs.readFileSync('lib/operator/runtime/IntelligenceContextBudgetRuntime.js', 'utf8');
const semantic = fs.readFileSync('lib/operator/runtime/OperatorHumanBusinessPartnerUnderstandingRuntime.js', 'utf8');
const fast = fs.readFileSync('lib/operator/runtime/OperatorFastConversationRuntime.js', 'utf8');
const pdf = fs.readFileSync('lib/finance/accounts-receivable/documents/renderCustomerInvoicePdf.js', 'utf8');

test('recent conversation preserves presentation artifacts and execution continuity', () => {
  assert.match(governor, /presentation_artifacts/);
  assert.match(governor, /capability_key/);
  assert.match(budget, /presentation_artifacts/);
});

test('semantic understanding has a generic read-only artifact reuse intent', () => {
  assert.match(semantic, /artifact_intent/);
  assert.match(semantic, /reuse_existing/);
  assert.match(semantic, /Recent presentation_artifacts are read-only continuity references/);
  assert.match(semantic, /requires_mutation=false/);
});

test('artifact reuse returns prior artifact without business mutation', () => {
  assert.match(fast, /latestReusablePresentationArtifact/);
  assert.match(fast, /semantic-artifact-reuse-v1/);
  assert.match(fast, /mutation_executed: false/);
  assert.match(fast, /I did not create or change anything/);
});

test('invoice dates have additional breathing room below party blocks', () => {
  assert.match(pdf, /const metaTop = 244;/);
  assert.match(pdf, /let y = 286;/);
});
