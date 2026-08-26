import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const operatorPath = new URL(
  "../components/operator/AvantiqoOperator.jsx",
  import.meta.url,
);
const panelPath = new URL(
  "../components/operator/AvantiqoVoiceLibraryPanel.jsx",
  import.meta.url,
);
const lifecyclePatcherPath = new URL(
  "../scripts/patch-avantiqo-voice-library-recording-lifecycle-local.mjs",
  import.meta.url,
);

test("Voice Library enrollment is explicitly separate from Operator STT", async () => {
  const operator = await readFile(operatorPath, "utf8");
  const panel = await readFile(panelPath, "utf8");

  assert.match(operator, /AvantiqoVoiceLibraryPanel/);
  assert.match(operator, /voiceLibraryOpenRef\.current/);
  assert.match(operator, /openVoiceLibrary/);
  assert.match(operator, /stopWakeRecognition\(\);/);
  assert.match(operator, /disabled=\{busy \|\| voiceBusy \|\| recording \|\| speaking\}/);
  assert.match(operator, /speakingRef\.current/);

  assert.match(panel, /This is separate from voice commands/);
  assert.match(panel, /navigator\.mediaDevices\.getUserMedia/);
  assert.match(panel, /MediaRecorder/);
  assert.doesNotMatch(panel, /\/api\/operator\/transcribe/);
  assert.doesNotMatch(panel, /transcribeVoice/);
});

test("Voice Library enrollment requires an explicit authorized-rights decision", async () => {
  const panel = await readFile(panelPath, "utf8");

  assert.match(panel, /SELF/);
  assert.match(panel, /AUTHORIZED/);
  assert.match(panel, /LICENSED/);
  assert.match(panel, /consentConfirmed/);
  assert.match(panel, /Authorization \/ license reference/);
  assert.match(panel, /Confirm that you own or are authorized to use this voice/);
});

test("Voice Library UI exposes identity management without generating speech", async () => {
  const panel = await readFile(panelPath, "utf8");

  assert.match(panel, /Set default/);
  assert.match(panel, /togglePreview/);
  assert.match(panel, /deleteProfile/);
  assert.match(panel, /DELIVERY_PROFILES/);
  assert.match(panel, /avantiqo-secretary-v1/);
  assert.match(panel, /avantiqo-executive-v1/);
  assert.match(panel, /avantiqo-warm-v1/);
  assert.match(panel, /avantiqo-neutral-v1/);
  assert.doesNotMatch(panel, /\/api\/operator\/speak/);
  assert.doesNotMatch(panel, /ai\.text\.to\.speech/);
  assert.doesNotMatch(panel, /RUNPOD/);
});

test("Voice Library UI uses authenticated organization-scoped API calls", async () => {
  const panel = await readFile(panelPath, "utf8");

  assert.match(panel, /organizationId/);
  assert.match(panel, /entityId/);
  assert.match(panel, /credentials: "same-origin"/);
  assert.match(panel, /\/api\/operator\/voice-library/);
  assert.match(panel, /preview: "true"/);
});

test("Voice Library lifecycle patcher revokes the current recording URL and tears down recording resources", async () => {
  const patcher = await readFile(lifecyclePatcherPath, "utf8");

  assert.match(patcher, /AVANTIQO_VOICE_LIBRARY_RECORDING_LIFECYCLE_PATCH_V1/);
  assert.match(patcher, /const recordingUrlRef = useRef\(""\);/);
  assert.match(patcher, /function releaseRecordingUrl\(\)/);
  assert.match(patcher, /URL\.revokeObjectURL\(url\)/);
  assert.match(patcher, /recordingUrlRef\.current = url/);
  assert.match(patcher, /function stopRecorderForCleanup\(\)/);
  assert.match(patcher, /recorder\.onstop = null/);
  assert.match(patcher, /releaseRecordingStream\(\)/);
  assert.match(patcher, /previewAudio\.pause\?\.\(\)/);
  assert.match(patcher, /production_deploy_performed: false/);
  assert.match(patcher, /generation_submitted: false/);
  assert.match(patcher, /gpu_started: false/);
});
