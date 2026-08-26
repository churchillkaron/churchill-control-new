import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const operatorPath = new URL(
  "../components/operator/AvantiqoOperator.jsx",
  import.meta.url,
);
const wakeBridgePath = new URL(
  "../components/operator/HeyAvantiqoWakeBridge.jsx",
  import.meta.url,
);
const localWakeBridgePath = new URL(
  "../components/operator/LocalHeyAvantiqoWakeBridge.jsx",
  import.meta.url,
);

async function source(url) {
  return readFile(url, "utf8");
}

function assertNoBrowserRunpodAccess(value) {
  assert.doesNotMatch(value, /https:\/\/api\.runpod\.ai/i);
  assert.doesNotMatch(value, /rest\.runpod/i);
  assert.doesNotMatch(value, /RUNPOD_API_KEY/);
}

test("Operator uses shared async STT and TTS clients for voice turns", async () => {
  const operator = await source(operatorPath);

  assert.match(operator, /AsyncRecordedTranscriptionClient/);
  assert.match(operator, /transcribeRecordedAudio/);
  assert.match(operator, /AsyncSpeechClient/);
  assert.match(operator, /requestAsyncSpeechBlob/);
  assert.match(operator, /source:\s*"voice"/);
  assert.match(operator, /spokenReplyAbortRef/);
  assert.doesNotMatch(operator, /fetch\("\/api\/operator\/transcribe"/);
  assert.doesNotMatch(operator, /fetch\("\/api\/operator\/speak\/jobs"/);
  assertNoBrowserRunpodAccess(operator);
});

test("Hey Avantiqo uses shared async clients and aborts both on shutdown", async () => {
  const bridge = await source(wakeBridgePath);

  assert.match(bridge, /AsyncRecordedTranscriptionClient/);
  assert.match(bridge, /transcribeRecordedAudio/);
  assert.match(bridge, /AsyncSpeechClient/);
  assert.match(bridge, /requestAsyncSpeechBlob/);
  assert.match(bridge, /transcriptionAbortRef/);
  assert.match(bridge, /speechAbortRef/);
  assert.match(bridge, /cancelAsyncVoiceWork/);
  assert.match(bridge, /transcriptionAbortRef\.current\?\.abort\(\)/);
  assert.match(bridge, /speechAbortRef\.current\?\.abort\(\)/);
  assert.doesNotMatch(bridge, /fetch\("\/api\/operator\/transcribe"/);
  assert.doesNotMatch(bridge, /fetch\("\/api\/operator\/speak\/jobs"/);
  assertNoBrowserRunpodAccess(bridge);
});

test("Local wake bridge uses shared async STT and never submits provider work directly", async () => {
  const bridge = await source(localWakeBridgePath);

  assert.match(bridge, /AsyncRecordedTranscriptionClient/);
  assert.match(bridge, /transcribeRecordedAudio/);
  assert.doesNotMatch(bridge, /fetch\("\/api\/operator\/transcribe"/);
  assert.doesNotMatch(bridge, /\/api\/operator\/speak\/jobs/);
  assertNoBrowserRunpodAccess(bridge);
});
