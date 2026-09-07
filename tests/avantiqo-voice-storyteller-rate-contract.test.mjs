import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const handler = fs.readFileSync('services/avantiqo-voice-tts/handler.py','utf8');
const provider = fs.readFileSync('lib/platform/service-runtime/providers/avantiqo-voice/AvantiqoVoiceProvider.js','utf8');

test('owned voice exposes certified cinematic storyteller profile', () => {
  assert.match(handler, /"avantiqo-storyteller-v1"/);
  assert.match(handler, /"delivery": "dark_cinematic_storyteller"/);
  assert.match(handler, /"paragraph_pause_ms": 850/);
});

test('service runtime forwards governed speech rate to owned voice worker', () => {
  assert.match(provider, /speech_rate:/);
  assert.match(provider, /input\.speed/);
  assert.match(handler, /AVANTIQO_VOICE_TTS_SPEECH_RATE_NOT_CERTIFIED/);
  assert.match(handler, /atempo=/);
});
