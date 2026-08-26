import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const relay = await readFile(
  new URL("../supabase/functions/avantiqo-voice-realtime-relay/index.ts", import.meta.url),
  "utf8",
);

const realtimeClient = await readFile(
  new URL("../lib/operator/voice/RealtimeTranscriptionClient.js", import.meta.url),
  "utf8",
);

const sessionRoute = await readFile(
  new URL("../app/api/operator/transcribe/realtime/session/route.js", import.meta.url),
  "utf8",
);

const settleRoute = await readFile(
  new URL("../app/api/operator/transcribe/realtime/settle/route.js", import.meta.url),
  "utf8",
);

test("Voice realtime relay is first-party authenticated and release-gated", () => {
  assert.match(relay, /AVANTIQO_VOICE_REALTIME_RELAY_V1/);
  assert.match(relay, /AVANTIQO_VOICE_REALTIME_STT_REALTIME_V1/);
  assert.match(relay, /CLIENT_PROTOCOL = "avantiqo-voice-realtime-v1"/);
  assert.match(relay, /JWT_PROTOCOL_PREFIX = "jwt\."/);
  assert.match(relay, /admin\.auth\.getUser\(token\)/);
  assert.match(relay, /from\("staff_accounts"\)/);
  assert.match(relay, /from\("organization_users"\)/);
  assert.match(relay, /AVANTIQO_VOICE_REALTIME_RELAY_ENABLED/);
  assert.match(relay, /AVANTIQO_VOICE_REALTIME_ENGINE_CERTIFIED/);
  assert.match(relay, /AVANTIQO_VOICE_REALTIME_RELEASE_APPROVED/);
});

test("Voice realtime relay confines RunPod credentials and signs exact worker sessions", () => {
  assert.match(relay, /AVANTIQO_VOICE_REALTIME_RUNPOD_API_KEY/);
  assert.match(relay, /Authorization:\s*`Bearer \$\{runpodKey\}`/);
  assert.match(relay, /AVANTIQO_VOICE_REALTIME_RELAY_SECRET/);
  assert.match(relay, /crypto\.subtle\.importKey/);
  assert.match(relay, /name: "HMAC", hash: "SHA-256"/);
  assert.match(relay, /expiresAt = Math\.floor\(Date\.now\(\) \/ 1000\) \+ SESSION_TTL_SECONDS/);
  assert.match(relay, /organization_id: organizationId/);
  assert.doesNotMatch(relay, /NEXT_PUBLIC_.*RUNPOD/i);
  assert.doesNotMatch(relay, /client\.send\([^)]*runpodKey/i);
});

test("Voice realtime relay forwards only bounded audio lifecycle events", () => {
  assert.match(relay, /MAX_CLIENT_EVENT_CHARS = 100_000/);
  assert.match(relay, /MAX_TOTAL_AUDIO_BASE64_CHARS = 1_400_000/);
  for (const event of [
    "audio.append",
    "audio.commit",
    "session.cancel",
    "session.ping",
  ]) {
    assert.match(relay, new RegExp(event.replace(".", "\\.")));
  }
  assert.match(relay, /AVANTIQO_VOICE_REALTIME_CLIENT_EVENT_FORBIDDEN/);
  assert.match(relay, /AVANTIQO_VOICE_REALTIME_UPSTREAM_EVENT_TOO_LARGE/);
  assert.match(relay, /SESSION_HARD_TIMEOUT_MS = 90_000/);
});

test("uncertified realtime public entrypoints remain fail-closed while relay source exists", () => {
  assert.match(realtimeClient, /AVANTIQO_OWNED_REALTIME_STT_NOT_CERTIFIED/);
  assert.match(realtimeClient, /realtime_streaming_certified:\s*false/);
  assert.match(sessionRoute, /AVANTIQO_OWNED_REALTIME_STT_NOT_CERTIFIED/);
  assert.match(settleRoute, /AVANTIQO_OWNED_REALTIME_STT_NOT_CERTIFIED/);
  assert.doesNotMatch(realtimeClient, /new WebSocket\(/);
  assert.doesNotMatch(sessionRoute, /client_secret/);
  assert.doesNotMatch(settleRoute, /provider:\s*"openai"/);
});
