import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const relay = fs.readFileSync("supabase/functions/avantiqo-voice-realtime-relay/index.ts", "utf8");
const publicClient = fs.readFileSync("lib/operator/voice/RealtimeTranscriptionClient.js", "utf8");
const operator = fs.readFileSync("components/operator/AvantiqoOperator.jsx", "utf8");
const session = fs.readFileSync("app/api/operator/transcribe/realtime/session/route.js", "utf8");
const settle = fs.readFileSync("app/api/operator/transcribe/realtime/settle/route.js", "utf8");

test("realtime relay itself is a first-party fail-closed stub until certification", () => {
  assert.match(relay, /AVANTIQO_VOICE_REALTIME_RELAY_V2/);
  assert.match(relay, /AVANTIQO_VOICE_REALTIME_MODAL_RUNTIME_NOT_CERTIFIED/);
  assert.match(relay, /realtime_available: false/);
  assert.match(relay, /fallback_to_batch_transcription_required: true/);
  assert.match(relay, /external_provider_fallback_allowed: false/);
  assert.match(relay, /status: 503/);
  assert.doesNotMatch(relay, /NEXT_PUBLIC_.*RUNPOD|WebSocket|Authorization:/i);
});

test("release Operator does not activate uncertified realtime", () => {
  assert.match(publicClient, /AVANTIQO_OWNED_REALTIME_STT_NOT_CERTIFIED/);
  assert.match(publicClient, /realtime_streaming_certified:\s*false/);
  assert.doesNotMatch(operator, /OwnedRealtimeTranscriptionRelayClient|startOwnedRealtimeRelayTranscription/);
  assert.match(operator, /AsyncRecordedTranscriptionClient/);
  assert.match(operator, /transcribeRecordedAudio/);
});

test("public realtime session and settlement routes fail closed", () => {
  for (const source of [session, settle]) {
    assert.match(source, /AVANTIQO_OWNED_REALTIME_STT_NOT_CERTIFIED/);
    assert.match(source, /realtime_streaming_certified:\s*false/);
    assert.match(source, /status: 410/);
  }
});
