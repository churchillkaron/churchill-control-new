import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { resolvePreSemanticReadIntent } from '../lib/operator/runtime/OperatorPreSemanticReadRuntime.js';
import { readOperatorWeather } from '../lib/platform/research/runtime/OperatorWeatherRuntime.js';

test('weather clarification carries exact capability and device-location support', () => {
  const first = resolvePreSemanticReadIntent({ message: "how's the weather" });
  assert.equal(first?.capability_key, 'platform.weather.read');
  assert.equal(first?.clarification_required, true);
  assert.equal(first?.clarification_field, 'location');
  assert.equal(first?.accepts_device_location, true);
});

test('my location fills the exact prior weather slot from trusted coordinates without rematching topic', () => {
  const second = resolvePreSemanticReadIntent({
    message: 'my location',
    immediateConversation: [
      {
        role: 'assistant',
        content: 'Which location should I use?',
        clarification: {
          required: true,
          field_key: 'location',
          capability_key: 'platform.weather.read',
          accepts_device_location: true,
        },
      },
      { role: 'user', content: 'my location' },
    ],
    deviceLocation: { latitude: 7.8804, longitude: 98.3923, accuracy_m: 80 },
  });
  assert.equal(second?.capability_key, 'platform.weather.read');
  assert.equal(second?.route, 'evidence');
  assert.equal(second?.goal_relation, 'continue');
  assert.equal(second?.capability_payload?.latitude, 7.8804);
  assert.equal(second?.capability_payload?.longitude, 98.3923);
  assert.equal(second?.capability_payload?.location, undefined);
  assert.equal(second?.authorization_effect, 'NONE');
});

test('denied device location asks for city instead of inventing a place', () => {
  const result = resolvePreSemanticReadIntent({
    message: 'use my location',
    immediateConversation: [
      {
        role: 'assistant',
        content: 'Which location should I use?',
        clarification: { required: true, field_key: 'location', capability_key: 'platform.weather.read', accepts_device_location: true },
      },
      { role: 'user', content: 'use my location' },
    ],
    deviceLocation: { status: 'denied' },
  });
  assert.equal(result?.clarification_required, true);
  assert.match(result?.clarification_question || '', /could not access your device location/i);
  assert.equal(result?.capability_payload?.location, undefined);
});

test('weather runtime accepts trusted coordinates directly', async () => {
  const result = await readOperatorWeather({ payload: { latitude: 7.8804, longitude: 98.3923, location_label: 'Current location' } });
  assert.equal(result?.status, 'CURRENT_WEATHER');
  assert.equal(result?.location?.name, 'Current location');
  assert.equal(Number.isFinite(result?.current?.temperature_c), true);
  assert.equal(result?.authorization_effect, 'NONE');
});

test('client only requests GPS for a structured location clarification', () => {
  const ui = fs.readFileSync('components/operator/HomeAvantiqoIntelligence.jsx', 'utf8');
  assert.match(ui, /previousAssistant\?\.clarification\?\.field_key === "location"/);
  assert.match(ui, /currentLocationReference\(message\)/);
  assert.match(ui, /navigator\.geolocation\.getCurrentPosition/);
  assert.match(ui, /clientContext: \{ deviceLocation \}/);
});
