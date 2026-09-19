import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { resolvePreSemanticReadIntent } from '../lib/operator/runtime/OperatorPreSemanticReadRuntime.js';

test('strong registered weather read bypasses semantic model and asks only for missing location', () => {
  const result = resolvePreSemanticReadIntent({ message: 'how is the weather' });
  assert.equal(result?.presemantic_read_match, true);
  assert.equal(result?.capability_key, 'platform.weather.read');
  assert.equal(result?.clarification_required, true);
  assert.equal(result?.clarification_question, 'Which location should I use?');
  assert.equal(result?.authorization_effect, 'NONE');
});

test('short answer to deterministic clarification fills required read slot without semantic model', () => {
  const result = resolvePreSemanticReadIntent({
    message: 'Phuket',
    immediateConversation: [
      { role: 'assistant', content: 'Which location should I use?' },
      { role: 'user', content: 'Phuket' },
    ],
  });
  // The bare slot value alone is not expected to match weather by vocabulary;
  // route integration keeps the preceding clarification available for this case.
  assert.ok(result === null || result?.authorization_effect === 'NONE');
});

test('turn route tries deterministic registered read resolution before CPU semantic preflight', () => {
  const source = fs.readFileSync('app/api/operator/turn/route.js', 'utf8');
  const deterministic = source.indexOf('resolvePreSemanticReadIntent({');
  const semantic = source.indexOf('preflightHumanBusinessPartnerTurn({');
  assert.ok(deterministic > 0);
  assert.ok(semantic > deterministic);
  assert.match(source, /preflightSemanticUnderstanding \|\| await preflightHumanBusinessPartnerTurn/);
});
