import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const source = fs.readFileSync('lib/operator/runtime/OperatorFastConversationRuntime.js', 'utf8');

test('semantic understanding outranks keyword continuity helpers', () => {
  assert.match(source, /const thesisReply = semanticUnderstanding \? null : businessThesisContinuityReply/);
  assert.match(source, /const projectReply = semanticUnderstanding \? null : projectContinuityReply/);
});

test('instant local replies are limited to semantically lightweight conversation', () => {
  assert.match(source, /semanticRoute === "conversation"/);
  assert.match(source, /semanticConversationMode === "light"/);
  assert.match(source, /!semanticContinuity/);
  assert.match(source, /!semanticCorrection/);
  assert.match(source, /!semanticEvidenceRequired/);
  assert.match(source, /\(!semanticUnderstanding \|\| semanticLightweight\) \? localInstantReply : null/);
});
