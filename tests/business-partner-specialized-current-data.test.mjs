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

test('one CPU semantic pass can carry a location hint', () => {
  assert.match(front, /;l=<location>/);
  assert.match(front, /location ::= location_char\+/);
  assert.match(semantic, /location_hint:\s*text\(source\.l, 240\)/);
});

test('weather direct read receives semantic location and can clarify without another model', () => {
  assert.match(fast, /directReadKey === "platform\.weather\.read"/);
  assert.match(fast, /location:\s*text\(semanticUnderstanding\?\.location_hint, 240\) \|\| null/);
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
