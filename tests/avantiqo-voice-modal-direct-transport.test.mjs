import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const direct = fs.readFileSync(
  new URL("../lib/platform/service-runtime/providers/avantiqo-voice/AvantiqoVoiceModalDirectRuntime.js", import.meta.url),
  "utf8",
);
const provider = fs.readFileSync(
  new URL("../lib/platform/service-runtime/providers/avantiqo-voice/AvantiqoVoiceProviderV2.js", import.meta.url),
  "utf8",
);
const registration = fs.readFileSync(
  new URL("../lib/platform/service-runtime/providers/avantiqo-voice/AvantiqoVoiceProviderRegistration.js", import.meta.url),
  "utf8",
);
const executor = fs.readFileSync(
  new URL("../lib/platform/service-runtime/providers/ProviderExecutorCore.js", import.meta.url),
  "utf8",
);
const modalApp = fs.readFileSync(
  new URL("../services/avantiqo-voice-modal/modal_app.py", import.meta.url),
  "utf8",
);

test("Voice Service Runtime loads direct-first V2 provider", () => {
  assert.match(executor, /import\("\.\/avantiqo-voice\/AvantiqoVoiceProviderV2\.js"\)/);
  assert.match(executor, /module => module\.AvantiqoVoiceProviderV2/);
  assert.match(provider, /voiceModalDirectConfigured\(\)/);
  assert.match(provider, /executeVoiceModalDirect/);
  assert.match(provider, /getVoiceModalDirectStatus/);
  assert.match(provider, /LegacyVoiceProvider\.execute\(input\)/);
  assert.match(provider, /LegacyVoiceProvider\.getStatus\(input\)/);
});

test("Voice direct lane uses Modal JS SDK function calls without CPU gateway", () => {
  assert.match(direct, /const APP_NAME = "avantiqo-voice-owned"/);
  assert.match(direct, /const DIRECT_TRANSPORT = "modal-js-sdk-function-call-v1"/);
  assert.match(direct, /new sdk\.ModalClient\(\{ tokenId: configValue\.tokenId, tokenSecret: configValue\.tokenSecret \}\)/);
  assert.match(direct, /client\.functions\.fromName\(APP_NAME, functionName/);
  assert.match(direct, /worker\.spawn\(\[payload\]\)/);
  assert.match(direct, /client\.functionCalls\.fromId\(parsed\.callId\)/);
  assert.match(direct, /modal_gateway_used:\s*false/);
  assert.doesNotMatch(direct, /AVANTIQO_VOICE_MODAL_BASE_URL/);
  assert.doesNotMatch(direct, /AVANTIQO_VOICE_MODAL_GATEWAY_TOKEN/);
  assert.doesNotMatch(direct, /RUNPOD_API_KEY/);
});

test("Voice direct lane maps STT and TTS to exact owned Modal functions", () => {
  assert.match(direct, /capability === "ai\.speech\.to\.text"\) return "transcribe"/);
  assert.match(direct, /capability === "ai\.text\.to\.speech"\) return "speak"/);
  assert.match(modalApp, /APP_NAME = "avantiqo-voice-owned"/);
  assert.match(modalApp, /def transcribe\(/);
  assert.match(modalApp, /def speak\(/);
  assert.match(modalApp, /GPU = "A10G"/);
});

test("Voice Modal functions are scale-to-zero one-container workers with no persistent Volume", () => {
  const minZero = [...modalApp.matchAll(/min_containers=0/g)].length;
  const maxOne = [...modalApp.matchAll(/max_containers=1/g)].length;
  const buffersZero = [...modalApp.matchAll(/buffer_containers=0/g)].length;
  assert.equal(minZero, 2);
  assert.equal(maxOne, 2);
  assert.equal(buffersZero, 2);
  assert.match(modalApp, /scaledown_window=5/);
  assert.doesNotMatch(modalApp, /modal\.Volume/);
  assert.doesNotMatch(modalApp, /Volume\.from_name/);
});

test("TTS final WAV persistence is owned by Avantiqo after GPU inference", () => {
  assert.match(direct, /getServiceSupabase/);
  assert.match(direct, /storage\.from\(OUTPUT_BUCKET\)\.upload/);
  assert.match(direct, /delete cleaned\.audio_base64/);
  assert.match(direct, /audio_persisted_by:\s*"AVANTIQO_SERVICE_RUNTIME"/);
  assert.match(direct, /modal_final_artifact_persistence:\s*false/);
  assert.match(direct, /resolveCreativeProviderAssetUrl/);
});

test("Voice direct provider preserves consented reference-voice governance", () => {
  assert.match(provider, /VOICE_REFERENCE_CONTRACT = "AVANTIQO_VOICE_REFERENCE_V1"/);
  assert.match(provider, /SELF/);
  assert.match(provider, /AUTHORIZED/);
  assert.match(provider, /LICENSED/);
  assert.match(provider, /AVANTIQO_VOICE_REFERENCE_CONSENT_REQUIRED/);
  assert.match(provider, /resolveVoiceReferenceForExecution/);
  assert.match(provider, /organization_voice_library/);
});

test("Voice registration treats direct Modal credentials as primary readiness", () => {
  assert.match(registration, /MODAL_TOKEN_ID \|\| process\.env\.AVANTIQO_MODAL_TOKEN_ID/);
  assert.match(registration, /MODAL_TOKEN_SECRET \|\| process\.env\.AVANTIQO_MODAL_TOKEN_SECRET/);
  assert.match(registration, /modal_direct_primary:\s*true/);
  assert.match(registration, /modal_direct_transport:\s*"modal-js-sdk-function-call-v1"/);
  assert.match(registration, /modal_gateway_required:\s*false/);
  assert.match(registration, /direct_async_function_call:\s*true/);
  assert.match(registration, /tts_final_artifact_persistence:\s*"AVANTIQO_SERVICE_RUNTIME"/);
  assert.match(registration, /legacy_modal_gateway_migration_debt:\s*true/);
  assert.match(registration, /simultaneous_modal_runpod_execution_forbidden:\s*true/);
});
