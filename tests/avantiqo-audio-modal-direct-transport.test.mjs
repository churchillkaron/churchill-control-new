import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const provider = fs.readFileSync(
  new URL("../lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoAudioProvider.js", import.meta.url),
  "utf8",
);
const registration = fs.readFileSync(
  new URL("../lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoAudioProviderRegistration.js", import.meta.url),
  "utf8",
);
const sharedModal = fs.readFileSync(
  new URL("../lib/platform/service-runtime/providers/avantiqo-owned/AvantiqoOwnedModalWorker.js", import.meta.url),
  "utf8",
);

test("Audio primary lane is direct Avantiqo to Modal GPU with no CPU gateway", () => {
  assert.match(provider, /transportMode:\s*"direct-sdk"/);
  assert.match(provider, /const MODAL_APP_NAME = "avantiqo-audio-owned"/);
  assert.match(provider, /const MODAL_FUNCTION_NAME = "generate"/);
  assert.match(provider, /appName:\s*MODAL_APP_NAME/);
  assert.match(provider, /functionName:\s*MODAL_FUNCTION_NAME/);
  assert.match(provider, /modalDirectConfigured\(\)/);
  assert.doesNotMatch(provider, /AVANTIQO_AUDIO_MODAL_BASE_URL/);
  assert.doesNotMatch(provider, /AVANTIQO_AUDIO_MODAL_GATEWAY_TOKEN/);
  assert.doesNotMatch(provider, /httpContract:\s*"AVANTIQO_AUDIO_MODAL_HTTP_V1"/);
  assert.doesNotMatch(provider, /transport:\s*"modal-function-call"/);
});

test("Audio registration derives Modal readiness from direct SDK credentials only", () => {
  assert.match(registration, /MODAL_TOKEN_ID \|\| process\.env\.AVANTIQO_MODAL_TOKEN_ID/);
  assert.match(registration, /MODAL_TOKEN_SECRET \|\| process\.env\.AVANTIQO_MODAL_TOKEN_SECRET/);
  assert.match(registration, /modal_gateway_required:\s*false/);
  assert.match(registration, /modal_transport:\s*MODAL_TRANSPORT/);
  assert.match(registration, /MODAL_DIRECT_A10G_ASYNC_V1/);
  assert.doesNotMatch(registration, /AVANTIQO_AUDIO_MODAL_BASE_URL/);
  assert.doesNotMatch(registration, /AVANTIQO_AUDIO_MODAL_GATEWAY_TOKEN/);
  assert.doesNotMatch(registration, /modal_http_contract/);
});

test("shared Modal transport preserves Avantiqo control-plane ownership", () => {
  assert.match(sharedModal, /const DIRECT_MODAL_TRANSPORT = "modal-js-sdk-function-call-v1"/);
  assert.match(sharedModal, /new sdk\.ModalClient\(\{ tokenId: config\.tokenId, tokenSecret: config\.tokenSecret \}\)/);
  assert.match(sharedModal, /client\.functions\.fromName\(config\.appName, config\.functionName/);
  assert.match(sharedModal, /worker\.spawn\(\[payload\]\)/);
  assert.match(sharedModal, /client\.functionCalls\.fromId\(rawJobId\)/);
  assert.match(sharedModal, /modal_gateway_used:\s*false/);
  assert.match(sharedModal, /outputUploadTarget/);
  assert.match(sharedModal, /signedInputAssets/);
  assert.match(sharedModal, /organizationServiceId/);
});

test("RunPod remains guarded fallback and cannot replace direct primary silently", () => {
  assert.match(provider, /const SAFE_LEASE_CONTRACT = "AVANTIQO_RUNPOD_SAFE_LEASE_V2"/);
  assert.match(provider, /const SAFE_LEASE_LANE = "audio"/);
  assert.match(provider, /assertMusicSafeLease\(\)/);
  assert.match(provider, /AVANTIQO_MUSIC_PROVIDER_SAFE_LEASE_ENDPOINT_MISMATCH/);
  assert.match(registration, /simultaneous_modal_runpod_execution_forbidden:\s*true/);
  assert.match(registration, /runpod_safe_lease_required_for_primary_lane:\s*!modalPrimaryAvailable/);
});
