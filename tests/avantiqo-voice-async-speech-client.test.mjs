import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const client = await readFile(
  new URL("../lib/operator/voice/AsyncSpeechClient.js", import.meta.url),
  "utf8",
);
const patcher = await readFile(
  new URL("../scripts/patch-avantiqo-voice-async-speech-clients-local.mjs", import.meta.url),
  "utf8",
);

test("Voice speech client polls async TTS and cancels exact abandoned job", () => {
  assert.match(client, /\/api\/operator\/speak\/jobs/);
  assert.match(client, /response\.status === 202/);
  assert.match(client, /method: "DELETE"/);
  assert.match(client, /jobId: job/);
  assert.match(client, /keepalive: true/);
  assert.match(client, /if \(jobId && !terminal\)/);
});

test("Voice speech browser client never talks directly to RunPod", () => {
  assert.doesNotMatch(client, /runpod\.ai/i);
  assert.doesNotMatch(client, /rest\.runpod/i);
  assert.doesNotMatch(client, /api\.runpod/i);
});

test("Voice speech patcher requires verified STT patch and only targets TTS callers", () => {
  assert.match(patcher, /AVANTIQO_OPERATOR_ASYNC_STT_PATCH_REQUIRED_FIRST/);
  assert.match(patcher, /HEY_AVANTIQO_ASYNC_STT_PATCH_REQUIRED_FIRST/);
  assert.match(patcher, /components\/operator\/AvantiqoOperator\.jsx/);
  assert.match(patcher, /components\/operator\/HeyAvantiqoWakeBridge\.jsx/);
  assert.doesNotMatch(patcher, /LocalHeyAvantiqoWakeBridge\.jsx/);
  assert.match(patcher, /requestAsyncSpeechBlob/);
  assert.match(patcher, /production_deploy_performed: false/);
  assert.match(patcher, /generation_submitted: false/);
});
