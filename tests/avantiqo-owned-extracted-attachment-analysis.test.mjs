import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const runtime = readFileSync('lib/platform/runtime/ConversationAttachmentAnalysisRuntime.js', 'utf8');
const policy = readFileSync('lib/platform/service-runtime/providers/AvantiqoOwnedProviderPolicy.js', 'utf8');

test('extracted attachment content is semantically classified by owned Fast Intelligence', () => {
  assert.match(runtime, /const TEXT_ANALYSIS_SERVICE_ID = "ai\.text\.generate"/);
  assert.match(runtime, /\["TEXT_EXTRACTED", "STRUCTURE_EXTRACTED"\]/);
  assert.match(runtime, /CONVERSATION_ATTACHMENT_TEXT_ANALYSIS/);
  assert.match(runtime, /owned_only_required:\s*true/);
  assert.match(runtime, /external_provider_fallback_allowed:\s*false/);
  assert.match(runtime, /content_excerpt: prior\.content_excerpt/);
  assert.match(runtime, /provider: "avantiqo-intelligence"/);
  assert.match(policy, /"ai\.text\.generate": "avantiqo-intelligence"/);
});

test('semantic analysis failure preserves extracted evidence and does not guess a destination', () => {
  assert.match(runtime, /status: "SEMANTIC_ANALYSIS_UNAVAILABLE"/);
  assert.match(runtime, /\.\.\.analysis/);
  assert.match(runtime, /authorization_effect: "NONE"/);
});
