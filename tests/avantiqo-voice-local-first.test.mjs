import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const provider = await readFile(new URL("../lib/platform/service-runtime/providers/avantiqo-voice/AvantiqoVoiceProviderV2.js", import.meta.url), "utf8");
const registration = await readFile(new URL("../lib/platform/service-runtime/providers/avantiqo-voice/AvantiqoVoiceProviderRegistration.js", import.meta.url), "utf8");
const tts = await readFile(new URL("../lib/platform/service-runtime/providers/avantiqo-voice/AvantiqoVoiceTtsLocalQueueProvider.js", import.meta.url), "utf8");
test("Voice STT and TTS are Node 01 local-first with Modal fallback", () => {
  assert.match(provider, /AvantiqoVoiceSttLocalQueueProvider\.available/);
  assert.match(provider, /AvantiqoVoiceTtsLocalQueueProvider\.available/);
  assert.doesNotMatch(provider, /backgroundTts/);
  assert.match(provider, /AVANTIQO_VOICE_STT_LOCAL_FALLBACK_MODAL/);
  assert.match(provider, /AVANTIQO_VOICE_TTS_LOCAL_FALLBACK_MODAL/);
  assert.match(tts, /LOCAL_GPU_FIRST_MODAL_FALLBACK/);
  assert.match(registration, /local_first_execution: true/);
  assert.match(registration, /stt_local_first: true/);
  assert.match(registration, /tts_local_first: true/);
  assert.match(registration, /AVANTIQO_LOCAL_NODE_V1_PRIMARY_MODAL_FALLBACK/);
  assert.doesNotMatch(registration, /legacy_modal_gateway/);
});
