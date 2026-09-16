import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const platform = fs.readFileSync('lib/platform/runtime/PlatformDomainRuntime.js', 'utf8');
const bridge = fs.readFileSync('lib/operator/runtime/OperatorIntelligenceToolBridgeRuntime.js', 'utf8');
const fast = fs.readFileSync('lib/operator/runtime/OperatorFastConversationRuntime.js', 'utf8');
const semantic = fs.readFileSync('lib/operator/runtime/OperatorHumanBusinessPartnerUnderstandingRuntime.js', 'utf8');
const front = fs.readFileSync('services/avantiqo-intelligence-modal/modal_front_app.py', 'utf8');
const weather = fs.readFileSync('lib/platform/capabilities/createOperatorWeatherCapability.js', 'utf8');

test('weather is a registered read-only current-data capability', () => {
  assert.match(platform, /weather:\s*\{\s*read:\s*async \(\) => createOperatorWeatherCapability\(\)/s);
  assert.match(weather, /operatorMode:\s*"read"/);
  assert.match(weather, /operatorAutoExecute:\s*true/);
  assert.match(weather, /transactional:\s*false/);
});

test('strong specialized external reads outrank generic web research', () => {
  assert.match(bridge, /specializedExternalPreferred/);
  assert.match(bridge, /specialized_external_read_preferred/);
  assert.match(fast, /specializedExternalDirectRead/);
  assert.match(fast, /!specializedExternalDirectRead/);
});

test('current-data location extraction is deterministic outside the CPU grammar', () => {
  const fastIndex = fs.readFileSync('lib/operator/runtime/OperatorFastReadIndex.js', 'utf8');
  const presemantic = fs.readFileSync('lib/operator/runtime/OperatorPreSemanticReadRuntime.js', 'utf8');
  assert.doesNotMatch(front, /;l=<location>|location ::= location_char\+/);
  assert.match(fastIndex, /input_extractors|location/);
  assert.match(presemantic, /capability_payload/);
  assert.match(semantic, /location_hint:\s*text\(source\.l, 240\)/);
});

test('weather direct read receives semantic location and can clarify without another model', () => {
  assert.match(fast, /directReadKey === "platform\.weather\.read"/);
  assert.match(fast, /const declaredPayload = object\(semanticUnderstanding\?\.capability_payload\)/);
  assert.match(fast, /\.\.\.declaredPayload/);
  assert.match(fast, /location_hint/);
  assert.match(fast, /CLARIFICATION_REQUIRED/);
  assert.match(fast, /deterministic-read-clarification-v1/);
});

test('weather answers are presented from structured evidence', () => {
  assert.match(fast, /capabilityKey === "platform\.weather\.read"/);
  assert.match(fast, /temperature_c/);
  assert.match(fast, /precipitation_probability_max/);
});


test('simple current external facts fail closed instead of falling into generic chat', () => {
  assert.match(fast, /current_external_fact_fail_closed: true/);
  assert.match(fast, /deterministic-current-external-evidence-fail-closed-v1/);
  assert.match(fast, /I couldn't verify that current public information from live evidence right now, so I won't guess/);
});
