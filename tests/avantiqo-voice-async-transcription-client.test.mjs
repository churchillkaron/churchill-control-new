import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const helper = await readFile(
  new URL("../lib/operator/voice/AsyncRecordedTranscriptionClient.js", import.meta.url),
  "utf8",
);
const patcher = await readFile(
  new URL("../scripts/patch-avantiqo-voice-async-transcription-clients-local.mjs", import.meta.url),
  "utf8",
);

test("recorded Voice client polls async STT and cancels exact abandoned job", () => {
  assert.match(helper, /response\.status === 202 && result\?\.pending === true/);
  assert.match(helper, /method:\s*"DELETE"/);
  assert.match(helper, /keepalive:\s*true/);
  assert.match(helper, /jobId:\s*job/);
  assert.match(helper, /finally\s*\{/);
  assert.match(helper, /if \(jobId && !terminal\)/);
  assert.doesNotMatch(helper, /purge-queue|purgeQueue/i);
});

test("recorded Voice client keeps browser away from RunPod", () => {
  assert.doesNotMatch(helper, /runpod\.ai|runpod\.io|\/run\b/i);
  assert.match(helper, /\/api\/operator\/transcribe/);
});

test("client patcher is guarded and targets all recorded transcription callers", () => {
  assert.match(patcher, /replaceExactly/);
  assert.match(patcher, /SOURCE_BLOCK_NOT_UNIQUE/);
  assert.match(patcher, /components\/operator\/AvantiqoOperator\.jsx/);
  assert.match(patcher, /components\/operator\/HeyAvantiqoWakeBridge\.jsx/);
  assert.match(patcher, /components\/operator\/LocalHeyAvantiqoWakeBridge\.jsx/);
  assert.match(patcher, /transcribeRecordedAudio/);
  assert.match(patcher, /gpu_started:\s*false/);
  assert.match(patcher, /production_deploy_performed:\s*false/);
});
