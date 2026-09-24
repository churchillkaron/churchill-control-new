import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const provider = await readFile(new URL("../lib/platform/service-runtime/providers/avantiqo-voice/AvantiqoVoiceProviderV2.js", import.meta.url), "utf8");
const registration = await readFile(new URL("../lib/platform/service-runtime/providers/avantiqo-voice/AvantiqoVoiceProviderRegistration.js", import.meta.url), "utf8");
const tts = await readFile(new URL("../lib/platform/service-runtime/providers/avantiqo-voice/AvantiqoVoiceTtsLocalQueueProvider.js", import.meta.url), "utf8");
test("Voice STT and TTS are Node01 local-only and fail closed", () => {
  assert.match(provider, /AvantiqoVoiceSttLocalQueueProvider\.available/);
  assert.match(provider, /AvantiqoVoiceTtsLocalQueueProvider\.available/);
  assert.match(provider, /AVANTIQO_VOICE_LOCAL_NODE_UNAVAILABLE/);
  assert.match(tts, /LOCAL_GPU_ONLY/);
  assert.match(registration, /local_only_execution: true/);
  assert.match(registration, /local_first_execution: true/);
  assert.match(registration, /modal_fallback_when_local_unavailable: false/);
  assert.match(registration, /external_provider_fallback_allowed: false/);
  assert.doesNotMatch(provider, /executeVoiceModalDirect|RunPod|Safe Lease/i);
});
