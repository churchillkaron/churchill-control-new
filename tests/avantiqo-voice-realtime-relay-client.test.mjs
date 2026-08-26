import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("../lib/operator/voice/OwnedRealtimeTranscriptionRelayClient.js", import.meta.url),
  "utf8",
);

const publicClient = await readFile(
  new URL("../lib/operator/voice/RealtimeTranscriptionClient.js", import.meta.url),
  "utf8",
);

const operator = await readFile(
  new URL("../components/operator/AvantiqoOperator.jsx", import.meta.url),
  "utf8",
);

const wake = await readFile(
  new URL("../components/operator/LocalHeyAvantiqoWakeBridge.jsx", import.meta.url),
  "utf8",
);

test("owned realtime browser client authenticates only to the Avantiqo relay", () => {
  assert.match(source, /supabaseClient\.auth\.getSession\(\)/);
  assert.match(source, /avantiqo-voice-realtime-relay/);
  assert.match(source, /CLIENT_PROTOCOL = "avantiqo-voice-realtime-v1"/);
  assert.match(source, /`jwt\.\$\{token\}`/);
  assert.doesNotMatch(source, /api\.runpod\.ai/);
  assert.doesNotMatch(source, /RUNPOD_API_KEY/);
  assert.doesNotMatch(source, /Authorization:\s*`Bearer/);
});

test("owned realtime browser client is bounded, cancelable and audio-memory-only", () => {
  assert.match(source, /TARGET_SAMPLE_RATE = 16000/);
  assert.match(source, /CONNECT_TIMEOUT_MS = 7000/);
  assert.match(source, /COMMIT_TIMEOUT_MS = 7000/);
  assert.match(source, /MAX_SESSION_MS = 90_000/);
  assert.match(source, /audio\.append/);
  assert.match(source, /audio\.commit/);
  assert.match(source, /session\.cancel/);
  assert.match(source, /signal\.addEventListener\("abort"/);
  assert.match(source, /raw_audio_persisted:\s*false/);
  assert.doesNotMatch(source, /localStorage/);
  assert.doesNotMatch(source, /sessionStorage/);
  assert.doesNotMatch(source, /indexedDB/);
});

test("owned realtime browser client supports partial and final transcripts", () => {
  assert.match(source, /transcript\.partial/);
  assert.match(source, /stable_prefix/);
  assert.match(source, /transcript\.final/);
  assert.match(source, /AVANTIQO_VOICE_STT_REALTIME_V1/);
  assert.match(source, /onTranscript/);
});

test("owned realtime browser client stays dormant until Voice release certification", () => {
  assert.match(source, /wired_to_operator:\s*false/);
  assert.match(source, /realtime_streaming_certified:\s*false/);
  assert.match(publicClient, /AVANTIQO_OWNED_REALTIME_STT_NOT_CERTIFIED/);
  assert.doesNotMatch(operator, /OwnedRealtimeTranscriptionRelayClient/);
  assert.doesNotMatch(wake, /OwnedRealtimeTranscriptionRelayClient/);
});
