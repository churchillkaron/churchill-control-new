import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { resolvePreSemanticReadIntent } from '../lib/operator/runtime/OperatorPreSemanticReadRuntime.js';

const home = fs.readFileSync('components/operator/HomeAvantiqoIntelligence.jsx', 'utf8');

function clarificationTurn() {
  return {
    role: 'assistant',
    content: 'Which location should I use?',
    clarification: {
      required: true,
      capability_key: 'platform.weather.read',
      field_key: 'location',
      accepts_device_location: true,
    },
  };
}

test('mine resolves against a structured location slot as device location', () => {
  const result = resolvePreSemanticReadIntent({
    message: 'mine',
    immediateConversation: [clarificationTurn(), { role: 'user', content: 'mine' }],
    deviceLocation: { latitude: 7.8804, longitude: 98.3923, accuracy_m: 40 },
  });
  assert.equal(result?.capability_key, 'platform.weather.read');
  assert.equal(result?.route, 'evidence');
  assert.equal(result?.goal_relation, 'continue');
  assert.equal(result?.capability_payload?.latitude, 7.8804);
  assert.equal(result?.capability_payload?.longitude, 98.3923);
  assert.equal(result?.capability_payload?.location_label, 'Current location');
  assert.equal(result?.capability_payload?.location, undefined);
});

test('mine without trusted location asks for a city instead of becoming a literal place', () => {
  const result = resolvePreSemanticReadIntent({
    message: 'mine',
    immediateConversation: [clarificationTurn(), { role: 'user', content: 'mine' }],
  });
  assert.equal(result?.route, 'conversation');
  assert.equal(result?.clarification_required, true);
  assert.match(result?.clarification_question || '', /city|area/i);
  assert.equal(result?.capability_payload?.location, undefined);
});

test('Business Partner owns clipboard shortcuts while preserving native clipboard behavior', () => {
  assert.match(home, /data-avantiqo-clipboard-boundary="true"/);
  assert.match(home, /onKeyDownCapture=\{\(event\) => \{/);
  assert.match(home, /\["a", "c", "v", "x"\]\.includes\(key\)/);
  assert.match(home, /event\.stopPropagation\(\)/);
  assert.match(home, /onCopy=\{\(event\) => event\.stopPropagation\(\)\}/);
  assert.match(home, /onPaste=\{\(event\) => event\.stopPropagation\(\)\}/);
  assert.doesNotMatch(home, /onPaste=\{[^}]*preventDefault/);
});


test('client recognizes mine through the shared structured current-location resolver', () => {
  assert.match(home, /operatorReferenceNeedsDeviceLocation/);
  assert.match(home, /fieldKey: previousAssistant\?\.clarification\?\.field_key/);
  const shared = fs.readFileSync('lib/operator/contracts/OperatorSymbolicReference.js', 'utf8');
  assert.match(shared, /mine\|my/);
  assert.match(home, /deviceLocation = await browserLocation\(\)/);
});
