import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("../lib/operator/voice/OwnedRealtimeTranscriptionRelayClient.js", import.meta.url),
  "utf8",
);

const worklet = await readFile(
  new URL("../public/operator/voice/avantiqo-realtime-pcm-worklet.js", import.meta.url),
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
  assert.match(source, /READY_TIMEOUT_MS = 65_000/);
  assert.match(source, /CAPTURE_FLUSH_TIMEOUT_MS = 2000/);
  assert.match(source, /COMMIT_TIMEOUT_MS = 15_000/);
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

test("owned realtime browser client waits for exact worker readiness before audio", () => {
  assert.match(source, /worker_ready_required_before_audio:\s*true/);
  assert.match(source, /type === "relay\.connecting" \|\| type === "relay\.not_ready"/);
  assert.match(source, /type === "session\.ready"/);
  assert.match(source, /text\(payload\.contract\) !== REALTIME_CONTRACT/);
  assert.match(source, /if \(closed \|\| committed \|\| !workerReady\) return false/);
  assert.match(source, /!workerReady \|\|\s*websocket\.readyState !== WebSocket\.OPEN/);
  assert.match(source, /if \(!deferAudioCapture\) startCapture\(\)/);
  assert.match(source, /async waitUntilReady\(\)/);
});

test("owned realtime browser client requires AudioWorklet and flushes before commit", () => {
  assert.match(source, /audio_worklet_required:\s*true/);
  assert.match(source, /script_processor_fallback:\s*false/);
  assert.match(source, /audioContext\.audioWorklet\.addModule\(WORKLET_URL\)/);
  assert.match(source, /new AudioWorkletNode\(audioContext, WORKLET_PROCESSOR/);
  assert.match(source, /async function flushCapture\(\)/);
  assert.match(source, /await flushCapture\(\);\s*if \(closed\) throw new Error\("AVANTIQO_VOICE_REALTIME_BROWSER_SESSION_CLOSED"\);\s*committed = true/);
  assert.doesNotMatch(source, /createScriptProcessor/);
  assert.doesNotMatch(source, /onaudioprocess/);
  assert.match(worklet, /registerProcessor\(PROCESSOR_NAME, AvantiqoRealtimePcmCaptureProcessor\)/);
  assert.match(worklet, /TARGET_SAMPLE_RATE = 16000/);
  assert.match(worklet, /FRAME_SAMPLES = 320/);
  assert.match(worklet, /type: "audio\.pcm16"/);
  assert.match(worklet, /type: "audio\.flushed"/);
});

test("owned realtime browser commit is single-flight across concurrent callers", () => {
  assert.match(source, /single_flight_commit:\s*true/);
  assert.match(source, /let commitOperationPromise = null/);
  assert.match(source, /if \(!commitOperationPromise\)/);
  assert.match(source, /commitOperationPromise = \(async \(\) =>/);
  assert.match(source, /return commitOperationPromise/);
  assert.match(source, /boundedSend\(\{ type: "audio\.commit" \}\)/);
});

test("owned realtime browser client bounds WebSocket backpressure", () => {
  assert.match(source, /MAX_SOCKET_BUFFERED_BYTES = 262_144/);
  assert.match(source, /websocket_backpressure_bounded:\s*true/);
  assert.match(source, /max_websocket_buffered_bytes:\s*MAX_SOCKET_BUFFERED_BYTES/);
  assert.match(source, /websocket\.bufferedAmount \+ message\.length > MAX_SOCKET_BUFFERED_BYTES/);
  assert.match(source, /AVANTIQO_VOICE_REALTIME_BROWSER_BACKPRESSURE_LIMIT/);
  assert.match(source, /closeSocket\(1013, "browser backpressure"\)/);
  assert.match(source, /boundedSend\(\{\s*type: "audio\.append"/);
});

test("owned realtime browser client supports partial and final transcripts", () => {
  assert.match(source, /transcript\.partial/);
  assert.match(source, /stable_prefix/);
  assert.match(source, /transcript\.final/);
  assert.match(source, /AVANTIQO_VOICE_STT_REALTIME_V1/);
  assert.match(source, /onTranscript/);
});

test("Operator is wired to owned realtime with governed async fallback while release certification stays closed", () => {
  assert.match(source, /wired_to_operator:\s*true/);
  assert.match(source, /realtime_streaming_certified:\s*false/);
  assert.match(publicClient, /AVANTIQO_OWNED_REALTIME_STT_NOT_CERTIFIED/);
  assert.match(operator, /OwnedRealtimeTranscriptionRelayClient/);
  assert.match(operator, /startOwnedRealtimeRelayTranscription/);
  assert.match(operator, /await session\.waitUntilReady\(\)/);
  assert.match(operator, /if \(!session\.startCapture\(\)\)/);
  assert.match(operator, /transcribeRecordedAudio\(\{/);
  assert.match(operator, /AVANTIQO_VOICE_REALTIME_COMMIT_FALLBACK/);
  assert.doesNotMatch(wake, /OwnedRealtimeTranscriptionRelayClient/);
});
