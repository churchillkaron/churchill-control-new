import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const runtime = readFileSync('lib/platform/runtime/ConversationAttachmentAnalysisRuntime.js', 'utf8');
const policy = readFileSync('lib/platform/service-runtime/providers/AvantiqoOwnedProviderPolicy.js', 'utf8');
const voice = readFileSync('lib/platform/service-runtime/providers/avantiqo-voice/AvantiqoVoiceProviderV2.js', 'utf8');

test('audio uploads are transcribed by owned Avantiqo Voice before semantic routing', () => {
  assert.match(runtime, /const SPEECH_ANALYSIS_SERVICE_ID = "ai\.speech\.to\.text"/);
  assert.match(runtime, /CONVERSATION_ATTACHMENT_AUDIO_TRANSCRIPTION/);
  assert.match(runtime, /transcription_provider: "avantiqo-voice"/);
  assert.match(runtime, /analyzeExtractedAttachment/);
  assert.match(runtime, /owned_only_required:\s*true/);
  assert.match(runtime, /external_provider_fallback_allowed:\s*false/);
  assert.match(policy, /"ai\.speech\.to\.text": "avantiqo-voice"/);
  assert.match(voice, /openai\/whisper-large-v3-turbo/);
  assert.match(voice, /AVANTIQO_VOICE_MODAL_DIRECT_CONFIGURATION_REQUIRED/);
});

test('audio analysis failure cannot authorize or fabricate routing', () => {
  assert.match(runtime, /ATTACHMENT_AUDIO_TRANSCRIPT_REQUIRED/);
  assert.match(runtime, /status: "ANALYSIS_UNAVAILABLE"/);
  assert.match(runtime, /authorization_effect: "NONE"/);
});
