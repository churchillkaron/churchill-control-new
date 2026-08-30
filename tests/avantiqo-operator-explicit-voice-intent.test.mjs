import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("typed Operator turns never opt into Voice", async () => {
  const operator = await source("components/operator/AvantiqoOperator.jsx");
  const home = await source("components/operator/HomeAvantiqoIntelligence.jsx");

  assert.match(operator, /async function sendMessage\(rawValue, source = "text"\)/);
  assert.match(operator, /source: source === "voice" \? "voice" : "text"/);
  assert.match(home, /async function sendMessage\(rawValue, source = "text"\)/);
  assert.match(home, /if \(source === "voice"\) \{\s*speakResponse\(responseText\);/);
});

test("shared STT client requires and consumes a real Voice gesture", async () => {
  const stt = await source("lib/operator/voice/AsyncRecordedTranscriptionClient.js");

  assert.match(stt, /VOICE_CAPTURE_INTENT_KEY = "__avantiqo_voice_capture_intent_v2"/);
  assert.match(stt, /document\.addEventListener\(\s*"click"/);
  assert.match(stt, /explicitVoiceControl\(button\)/);
  assert.match(stt, /if \(!consumeCaptureIntent\(userInitiatedVoice\)\) throw new Error\("Explicit Voice action required"\)/);
  assert.match(stt, /delete window\[VOICE_CAPTURE_INTENT_KEY\]/);
  assert.match(stt, /grantReplyIntent\(\)/);
});

test("shared TTS client consumes exactly one reply permission granted by STT", async () => {
  const tts = await source("lib/operator/voice/AsyncSpeechClient.js");

  assert.match(tts, /VOICE_REPLY_INTENT_KEY = "__avantiqo_voice_reply_intent_v2"/);
  assert.match(tts, /if \(!consumeReplyIntent\(userInitiatedVoice\)\) \{/);
  assert.match(tts, /throw new Error\("Explicit Voice action required"\)/);
  assert.match(tts, /delete window\[VOICE_REPLY_INTENT_KEY\]/);
});

test("server STT and TTS routes remain fail-closed behind explicit Voice intent", async () => {
  const sttRoute = await source("app/api/operator/transcribe/route.js");
  const ttsRoute = await source("app/api/operator/speak/jobs/route.js");

  for (const route of [sttRoute, ttsRoute]) {
    assert.match(route, /EXPLICIT_VOICE_INTENT = "explicit-user-voice-v1"/);
    assert.match(route, /x-avantiqo-voice-intent/);
    assert.match(route, /Explicit Voice action required/);
  }
});
