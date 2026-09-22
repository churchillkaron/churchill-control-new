import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const specialist = fs.readFileSync(new URL('../lib/code/runtime/CodeAIParallelSpecialistReviewRuntime.js', import.meta.url), 'utf8');
const finalReview = fs.readFileSync(new URL('../lib/code/runtime/CodeAIFinalIndependentReviewRuntime.js', import.meta.url), 'utf8');
const provider = fs.readFileSync(new URL('../lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceProviderV2.js', import.meta.url), 'utf8');
const registration = fs.readFileSync(new URL('../lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceProviderRegistration.js', import.meta.url), 'utf8');
const localPolicy = fs.readFileSync(new URL('../lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceLocalPolicy.js', import.meta.url), 'utf8');
const worker = fs.readFileSync(new URL('../scripts/local-node/avantiqo-node01-worker.ps1', import.meta.url), 'utf8');

test('Code strategic reviewers preserve deep and fast lanes locally', () => {
  assert.match(specialist, /id:\s*"architecture_performance"[\s\S]*?execution_lane:\s*"deep"/);
  assert.match(specialist, /id:\s*"adversarial_risk"[\s\S]*?execution_lane:\s*"fast"/);
  assert.match(specialist, /modal_review_fallback_allowed:\s*false/);
});

test('Code final reviewers preserve deep and fast lanes locally', () => {
  assert.match(finalReview, /id:\s*"semantic_integration"[\s\S]*?execution_lane:\s*"deep"/);
  assert.match(finalReview, /id:\s*"adversarial_regression"[\s\S]*?execution_lane:\s*"fast"/);
  assert.match(finalReview, /modal_review_fallback_allowed:\s*false/);
});

test('owned intelligence provider has no Modal fallback', () => {
  assert.match(provider, /AVANTIQO_INTELLIGENCE_LOCAL_NODE_REQUIRED/);
  assert.match(provider, /AVANTIQO_INTELLIGENCE_MODAL_JOB_PREFIX = null/);
  assert.doesNotMatch(provider, /executeIntelligenceModalDirect|getIntelligenceModalDirectStatus|cancelIntelligenceModalDirect/);
  assert.match(registration, /local_only:\s*true/);
  assert.match(registration, /modal_fallback_allowed:\s*false/);
  assert.match(registration, /infrastructure_fallback:\s*null/);
});

test('Node01 local intelligence context is 20k in policy and worker', () => {
  assert.match(localPolicy, /AVANTIQO_INTELLIGENCE_LOCAL_CONTEXT_TOKENS = 20000/);
  assert.match(worker, /\$ContextTokens = 20000/);
});
