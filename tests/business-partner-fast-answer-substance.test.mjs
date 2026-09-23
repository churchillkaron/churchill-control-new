import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('written fast conversation stays useful instead of tiny and canned', () => {
  const source = fs.readFileSync('lib/operator/runtime/OperatorFastConversationRuntime.js', 'utf8');
  assert.doesNotMatch(source, /response_text: responseText\.slice\(0, 500\)/);
  assert.match(source, /response_text: responseText\.slice\(0, 4000\)/);
  assert.match(source, /semanticResponseDetail === "deep" \? 520/);
  assert.match(source, /semanticResponseDetail === "brief" \? 220 : 360/);
  assert.match(source, /Match the quality of a top human business partner/);
  assert.match(source, /Write like a capable senior Business Partner/);
  assert.match(source, /Light markdown is welcome when it helps/);
  assert.match(source, /recommendation_reason: text\(projectState\?\.recommendation_reason\) \|\| null/);
  assert.match(source, /recommendation_confidence: Number\.isFinite\(Number\(projectState\?\.recommendation_confidence\)\)/);
  assert.match(source, /expect_json: strategic/);
  assert.match(source, /project_state_update/);
  assert.match(source, /nextProjectState = \{/);
  assert.match(source, /project_state: nextProjectState/);
  assert.match(source, /continuity memory only/);
});

test('normal Business Partner cognition is CPU-first with explicit escalation only', () => {
  const fast = fs.readFileSync('lib/operator/runtime/OperatorFastConversationRuntime.js', 'utf8');
  const semantic = fs.readFileSync('lib/operator/runtime/OperatorHumanBusinessPartnerUnderstandingRuntime.js', 'utf8');
  const front = fs.readFileSync('lib/operator/runtime/OperatorFrontCognitionRuntime.js', 'utf8');
  assert.match(fast, /const ultraLightConversation = Boolean/);
  assert.match(fast, /CASUAL_PATTERNS\.some/);
  assert.match(fast, /front_task_mode: ultraLightConversation \? "conversation_light" : "conversation"/);
  assert.match(fast, /front_task_mode: ultraLightConversation \? "conversation_light" : "conversation"[\s\S]{0,900}allow_fast_escalation: false/);
  assert.match(fast, /semanticConversationMode === "light"[\s\S]{0,160}ultraLightConversation[\s\S]{0,160}speculative_light_safe/);
  assert.match(fast, /speculative_preflight_reuse/);
  assert.equal((semantic.match(/allow_fast_escalation: false/g) || []).length >= 2, true);
  assert.match(front, /zero_price_owned_cpu_lane: true/);
  assert.match(front, /OPERATOR_FRONT_COGNITION_CPU_READ_ONLY_BOUNDARY_REQUIRED/);
});

test('front semantic meaning stays compact while clarification is deterministic', () => {
  const semantic = fs.readFileSync('lib/operator/runtime/OperatorHumanBusinessPartnerUnderstandingRuntime.js', 'utf8');
  const presemantic = fs.readFileSync('lib/operator/runtime/OperatorPreSemanticReadRuntime.js', 'utf8');
  assert.match(semantic, /const compactIntent = text\(source\.i, 40\)\.toLowerCase\(\)/);
  assert.match(semantic, /const compactDomain = text\(source\.d, 40\)\.toLowerCase\(\)/);
  assert.match(semantic, /const compactEvidence = text\(source\.e, 40\)\.toLowerCase\(\)/);
  assert.match(semantic, /const compactAction = text\(source\.a, 40\)\.toLowerCase\(\)/);
  assert.match(semantic, /const compactRelation = text\(source\.g, 40\)\.toLowerCase\(\)/);
  assert.match(semantic, /const compactMode = text\(source\.m, 40\)\.toLowerCase\(\)/);
  assert.match(semantic, /Focused clarification is handled outside this classifier/);
  assert.match(presemantic, /CLARIFICATION_REQUIRED|clarification_required/);
  assert.doesNotMatch(semantic, /services\/avantiqo-intelligence-modal|ModalClient|RUNPOD_API_KEY/);
});
