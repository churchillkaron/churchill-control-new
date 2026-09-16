import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { resolvePreSemanticReadIntent } from '../lib/operator/runtime/OperatorPreSemanticReadRuntime.js';

test('natural weather phrasing resolves required location without extra model calls', () => {
  const missing = resolvePreSemanticReadIntent({ message: "how's the weather today" });
  assert.equal(missing?.clarification_required, true);
  assert.equal(missing?.clarification_field, 'location');

  for (const [message, expected] of [
    ['weather in Phuket today', 'Phuket'],
    ['Phuket weather today', 'Phuket'],
    ['weather for Karon', 'Karon'],
  ]) {
    const result = resolvePreSemanticReadIntent({ message });
    assert.equal(result?.capability_key, 'platform.weather.read', message);
    assert.equal(result?.route, 'evidence', message);
    assert.equal(result?.capability_payload?.location, expected, message);
  }
});

test('single-turn symbolic current location requests browser context before persistence', () => {
  const first = resolvePreSemanticReadIntent({ message: 'weather at my location' });
  assert.equal(first?.capability_key, 'platform.weather.read');
  assert.equal(first?.client_location_requested, true);
  assert.equal(first?.clarification_field, 'location');

  const granted = resolvePreSemanticReadIntent({
    message: 'weather at my location',
    deviceLocation: { status: 'granted', latitude: 13.7563, longitude: 100.5018, accuracy_m: 50 },
  });
  assert.equal(granted?.route, 'evidence');
  assert.equal(granted?.capability_payload?.latitude, 13.7563);
  assert.equal(granted?.capability_payload?.longitude, 100.5018);

  const denied = resolvePreSemanticReadIntent({
    message: 'weather at my location',
    deviceLocation: { status: 'denied' },
  });
  assert.equal(denied?.clarification_required, true);
  assert.equal(denied?.client_location_requested, false);
  assert.match(denied?.clarification_question || '', /city or area/i);
});

test('route and client implement transient device-location handshake without duplicate visible turn', () => {
  const route = fs.readFileSync('app/api/operator/turn/route.js', 'utf8');
  const ui = fs.readFileSync('components/operator/HomeAvantiqoIntelligence.jsx', 'utf8');
  assert.match(route, /client_context_request:\s*\{/);
  assert.match(route, /state_unchanged:\s*true/);
  assert.match(route, /kind:\s*"device_location"/);
  assert.match(ui, /result\?\.client_context_request\?\.kind === "device_location"/);
  assert.match(ui, /response = await requestTurn\(deviceLocation\)/);
});


test('immediate referential follow-up is never certified as context-free', async () => {
  const { operatorUtteranceDependsOnImmediateContext } = await import('../lib/operator/contracts/OperatorSymbolicReference.js');
  assert.equal(operatorUtteranceDependsOnImmediateContext('Give me one concrete example of that in a normal conversation.'), true);
  assert.equal(operatorUtteranceDependsOnImmediateContext('What about the second one?'), true);
  assert.equal(operatorUtteranceDependsOnImmediateContext('how are you'), false);

  const route = fs.readFileSync('app/api/operator/turn/route.js', 'utf8');
  assert.match(route, /preflight\.immediate_context_sufficient === true/);
  assert.match(route, /preflight_reused_without_durable_reclassification:\s*true/);
});

test('natural current-time phrasing routes deterministically with location extraction', () => {
  for (const [message, expected] of [
    ['what time is it in New York now?', 'New York'],
    ['current time in Singapore', 'Singapore'],
    ['what is the local time in London?', 'London'],
  ]) {
    const result = resolvePreSemanticReadIntent({ message });
    assert.equal(result?.capability_key, 'platform.time.read', message);
    assert.equal(result?.route, 'evidence', message);
    assert.equal(result?.capability_payload?.location, expected, message);
    assert.equal(result?.authorization_effect, 'NONE', message);
  }
});

test('structural context references distinguish real prior references from self-contained pronouns', async () => {
  const {
    operatorUtteranceDependsOnImmediateContext,
    operatorUtteranceRequiresPriorContext,
    operatorUtteranceExplicitlyNamesProductSurface,
  } = await import('../lib/operator/contracts/OperatorSymbolicReference.js');

  assert.equal(operatorUtteranceDependsOnImmediateContext('Give me one concrete example of that in a normal conversation.'), true);
  assert.equal(operatorUtteranceRequiresPriorContext('Go back to the previous project and continue it.'), true);
  assert.equal(operatorUtteranceRequiresPriorContext('How should Avantiqo improve Business Partner memory so it stays useful over years without becoming expensive?'), false);
  assert.equal(operatorUtteranceExplicitlyNamesProductSurface('How should Avantiqo improve Business Partner memory?'), true);
  assert.equal(operatorUtteranceExplicitlyNamesProductSurface('Explain why a good business assistant should ask focused follow-up questions.'), false);
});

