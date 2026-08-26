import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const worker = await readFile(
  new URL("../services/avantiqo-voice-stt-realtime/app.py", import.meta.url),
  "utf8",
);
const dockerfile = await readFile(
  new URL("../services/avantiqo-voice-stt-realtime/Dockerfile", import.meta.url),
  "utf8",
);
const browserClient = await readFile(
  new URL("../lib/operator/voice/RealtimeTranscriptionClient.js", import.meta.url),
  "utf8",
);
const sessionRoute = await readFile(
  new URL("../app/api/operator/transcribe/realtime/session/route.js", import.meta.url),
  "utf8",
);
const settlementRoute = await readFile(
  new URL("../app/api/operator/transcribe/realtime/settle/route.js", import.meta.url),
  "utf8",
);
const registration = await readFile(
  new URL("../lib/platform/service-runtime/providers/avantiqo-voice/AvantiqoVoiceProviderRegistration.js", import.meta.url),
  "utf8",
);

test("owned realtime STT worker has an isolated first-party streaming contract", () => {
  assert.match(worker, /REALTIME_CONTRACT = "AVANTIQO_VOICE_STT_REALTIME_V1"/);
  assert.match(worker, /CAPABILITY = "ai\.speech\.to\.text\.realtime"/);
  assert.match(worker, /PRODUCT_MODEL = "avantiqo-voice-stt-realtime-v1"/);
  assert.match(worker, /EXPECTED_FOUNDATION_MODEL = "openai\/whisper-large-v3-turbo"/);
  assert.match(worker, /@app\.websocket\("\/v1\/realtime\/transcribe"\)/);
  assert.match(worker, /"type": "session\.ready"/);
  assert.match(worker, /"type": "transcript\.partial"/);
  assert.match(worker, /"type": "transcript\.final"/);
  assert.match(worker, /"type": "session\.pong"/);
  assert.match(worker, /raw_audio_persisted/);
  assert.match(worker, /raw_reasoning_persisted/);
});

test("owned realtime STT authenticates only the server relay and bounds every session", () => {
  assert.match(worker, /AVANTIQO_VOICE_REALTIME_RELAY_SECRET/);
  assert.match(worker, /hmac\.new\(_relay_secret\(\), payload, hashlib\.sha256\)/);
  assert.match(worker, /hmac\.compare_digest/);
  assert.match(worker, /RELAY_TOKEN_MAX_FUTURE_SECONDS = 90/);
  assert.match(worker, /MAX_SESSION_SECONDS = 30/);
  assert.match(worker, /MAX_APPEND_BYTES/);
  assert.match(worker, /MAX_AUDIO_BYTES/);
  assert.match(worker, /asyncio\.Semaphore\(1\)/);
  assert.match(worker, /AVANTIQO_VOICE_REALTIME_AUDIO_LIMIT_EXCEEDED/);
  assert.match(worker, /audio\.clear\(\)/);
  assert.doesNotMatch(worker, /RUNPOD_API_KEY/);
  assert.doesNotMatch(worker, /OPENAI_API_KEY/);
});

test("realtime image contract is load-balanced HTTP/WebSocket shaped and not a queue worker", () => {
  assert.match(dockerfile, /pytorch\/pytorch:2\.7\.1-cuda12\.8-cudnn9-runtime/);
  assert.match(dockerfile, /AVANTIQO_VOICE_STT_FOUNDATION_MODEL=openai\/whisper-large-v3-turbo/);
  assert.match(dockerfile, /EXPOSE 80/);
  assert.match(dockerfile, /CMD \["python", "-u", "app\.py"\]/);
  assert.doesNotMatch(dockerfile, /runpod\.serverless/);
  assert.doesNotMatch(worker, /runpod\.serverless/);
});

test("uncertified realtime browser and server entrypoints remain fail-closed", () => {
  assert.match(browserClient, /AVANTIQO_OWNED_REALTIME_STT_NOT_CERTIFIED_V1/);
  assert.match(browserClient, /realtime_streaming_certified:\s*false/);
  assert.match(browserClient, /browser_provider_websocket_allowed:\s*false/);
  assert.doesNotMatch(browserClient, /new WebSocket/);
  assert.doesNotMatch(browserClient, /openai-insecure-api-key/);

  for (const route of [sessionRoute, settlementRoute]) {
    assert.match(route, /AVANTIQO_OWNED_REALTIME_STT_NOT_CERTIFIED/);
    assert.match(route, /realtime_streaming_certified:\s*false/);
    assert.doesNotMatch(route, /LiveProviderSessionRuntime/);
    assert.doesNotMatch(route, /ServiceExecutionRuntime/);
    assert.doesNotMatch(route, /provider:\s*"openai"/);
  }

  assert.match(registration, /realtime_streaming_certified:\s*false/);
});
