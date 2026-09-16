import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { normalizeHumanBusinessPartnerUnderstanding } from '../lib/operator/runtime/OperatorHumanBusinessPartnerUnderstandingRuntime.js';

test('compact missing-parameter semantics preserve one focused clarification', () => {
  const result = normalizeHumanBusinessPartnerUnderstanding({
    i: 'unclear', d: 'none', e: 'external', a: 'none', g: 'new', q: 'Which location should I use?'
  });
  assert.equal(result.clarification_required, true);
  assert.equal(result.clarification_question, 'Which location should I use?');
  assert.equal(result.goal_relation, 'new');
  assert.equal(result.evidence_scope, 'external');
});

test('context-free preflight sees only the immediate exchange and can resolve a slot follow-up', () => {
  const source = fs.readFileSync('lib/operator/runtime/OperatorHumanBusinessPartnerUnderstandingRuntime.js', 'utf8');
  assert.match(source, /list\(options\.immediateConversation\)\.slice\(-2\)/);
  assert.match(source, /assistant just asked for one missing detail/);
  assert.match(source, /i=followup and g=continue/);
  assert.match(source, /Focused clarification is handled outside this classifier/);
  assert.match(source, /using only i,d,e,a,g/);
});

test('turn route supplies immediate conversation before historical memory recovery', () => {
  const source = fs.readFileSync('app/api/operator/turn/route.js', 'utf8');
  assert.match(source, /const immediateConversation = boundedConversation\(body\.conversation\)\.slice\(-2\);/);
  assert.match(source, /preflightHumanBusinessPartnerTurn\([\s\S]*immediateConversation/);
});

test('continued simple external facts remain on the single governed read path', () => {
  const source = fs.readFileSync('lib/operator/runtime/OperatorFastConversationRuntime.js', 'utf8');
  assert.match(source, /\["new", "continue"\]\.includes\(text\(semanticUnderstanding\?\.goal_relation\)\.toLowerCase\(\)\)/);
  assert.match(source, /recent\.slice\(-3\)\.map\(\(item\) => text\(item\?\.content, 700\)\)/);
  assert.match(source, /capability_key: "platform\.research\.search"/);
});
