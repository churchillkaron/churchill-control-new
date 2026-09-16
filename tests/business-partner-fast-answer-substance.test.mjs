import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('written fast conversation stays useful instead of tiny and canned', () => {
  const source = fs.readFileSync('lib/operator/runtime/OperatorFastConversationRuntime.js', 'utf8');
  assert.doesNotMatch(source, /response_text: responseText\.slice\(0, 500\)/);
  assert.match(source, /response_text: responseText\.slice\(0, 4000\)/);
  assert.match(source, /semanticResponseDetail === "deep" \? 520/);
  assert.match(source, /semanticResponseDetail === "brief" \? 140 : 300/);
  assert.match(source, /Write like a capable senior Business Partner/);
  assert.match(source, /Light markdown is welcome when it helps/);
});

test('normal Business Partner cognition is CPU-first with explicit escalation only', () => {
  const fast = fs.readFileSync('lib/operator/runtime/OperatorFastConversationRuntime.js', 'utf8');
  const semantic = fs.readFileSync('lib/operator/runtime/OperatorHumanBusinessPartnerUnderstandingRuntime.js', 'utf8');
  const front = fs.readFileSync('lib/operator/runtime/OperatorFrontCognitionRuntime.js', 'utf8');
  assert.match(fast, /front_task_mode: "conversation"[\s\S]{0,500}allow_fast_escalation: false/);
  assert.equal((semantic.match(/allow_fast_escalation: false/g) || []).length >= 2, true);
  assert.match(front, /zero_price_owned_cpu_lane: true/);
  assert.match(front, /OPERATOR_FRONT_COGNITION_CPU_READ_ONLY_BOUNDARY_REQUIRED/);
});

test('front semantic grammar can carry one focused missing-detail question on CPU', () => {
  const worker = fs.readFileSync('services/avantiqo-intelligence-modal/modal_front_app.py', 'utf8');
  assert.match(worker, /optionally followed by ;q=<one short focused clarification question>/);
  assert.match(worker, /root ::= base \| base ";q=" question/);
  assert.match(worker, /question_char ::= \[\^\\n;\]/);
});
