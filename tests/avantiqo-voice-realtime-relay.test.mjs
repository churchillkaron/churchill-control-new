import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const relay = await readFile(
  new URL("../supabase/functions/avantiqo-voice-realtime-relay/index.ts", import.meta.url),
  "utf8",
);

const safeLease = await readFile(
  new URL("../supabase/functions/_shared/avantiqo-voice-realtime-safe-lease.ts", import.meta.url),
  "utf8",
);

const relaySafeLeasePatcher = await readFile(
  new URL("../scripts/patch-avantiqo-voice-realtime-relay-safe-lease-local.mjs", import.meta.url),
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
  assert.match(relay, /AVANTIQO_VOICE_STT_REALTIME_V1/);
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

test("Voice realtime load-balanced endpoint has its own Safe Lease controller", () => {
  assert.match(safeLease, /AVANTIQO_VOICE_REALTIME_SAFE_LEASE_V1/);
  assert.match(safeLease, /AVANTIQO_RUNPOD_SAFE_LEASE_V2/);
  assert.match(safeLease, /CANONICAL_ENDPOINT_NAME = "avantiqo-voice-stt-v1-realtime"/);
  assert.match(safeLease, /endpoint_type: "LOAD_BALANCER"/);
  assert.match(safeLease, /resting_workers_min:\s*0/);
  assert.match(safeLease, /resting_workers_max:\s*0/);
  assert.match(safeLease, /leased_workers_min:\s*0/);
  assert.match(safeLease, /leased_workers_max:\s*1/);
  assert.match(safeLease, /max_active_workers:\s*1/);
  assert.match(safeLease, /acquire_avantiqo_voice_runpod_lease_v2/);
  assert.match(safeLease, /refresh_avantiqo_voice_runpod_lease_v2/);
  assert.match(safeLease, /release_avantiqo_voice_runpod_lease_v2/);
  assert.match(safeLease, /patchEndpointWorkers\(resolvedEndpointId, 1\)/);
  assert.match(safeLease, /parkAndVerify\(resolvedEndpointId\)/);
  assert.match(safeLease, /queue_api_allowed:\s*false/);
  assert.match(safeLease, /purge_queue_allowed:\s*false/);
  assert.match(safeLease, /direct_run_allowed:\s*false/);
  assert.doesNotMatch(safeLease, /\/run\b/);
  assert.doesNotMatch(safeLease, /\/health\b/);
  assert.doesNotMatch(safeLease, /purge-queue/);
});

test("Voice realtime Safe Lease uses current Supabase secret-key header semantics", () => {
  assert.match(safeLease, /function isLegacyJwtKey\(value: string\)/);
  assert.match(safeLease, /function supabaseRpcHeaders\(key: string\)/);
  assert.match(safeLease, /apikey: key/);
  assert.match(safeLease, /isLegacyJwtKey\(key\) \? \{ Authorization: `Bearer \$\{key\}` \} : \{\}/);
  assert.match(safeLease, /headers: supabaseRpcHeaders\(key\)/);
});

test("Voice realtime relay Safe Lease patcher is guarded, local-only and queue-free", () => {
  assert.match(relaySafeLeasePatcher, /AVANTIQO_VOICE_REALTIME_RELAY_SAFE_LEASE_PATCH_V1/);
  assert.match(relaySafeLeasePatcher, /IMPORT_ANCHOR_CHANGED/);
  assert.match(relaySafeLeasePatcher, /SETUP_ANCHOR_CHANGED/);
  assert.match(relaySafeLeasePatcher, /FINISH_ANCHOR_CHANGED/);
  assert.match(relaySafeLeasePatcher, /acquireVoiceRealtimeSafeLease/);
  assert.match(relaySafeLeasePatcher, /realtimeEndpointIdFromWebSocketUrl\(runpodUrl\)/);
  assert.match(relaySafeLeasePatcher, /lease\.refresh\(\)/);
  assert.match(relaySafeLeasePatcher, /await lease\.release\(reason\)/);
  assert.match(relaySafeLeasePatcher, /await lease\.fail\(reason\)/);
  assert.match(relaySafeLeasePatcher, /if \(finishPromise\) return finishPromise/);
  assert.match(relaySafeLeasePatcher, /production_deploy_performed:\s*false/);
  assert.match(relaySafeLeasePatcher, /production_migration_applied:\s*false/);
  assert.match(relaySafeLeasePatcher, /production_function_deployed:\s*false/);
  assert.doesNotMatch(relaySafeLeasePatcher, /supabase\s+functions\s+deploy/i);
  assert.doesNotMatch(relaySafeLeasePatcher, /vercel\s+(?:--prod|deploy|build)/i);
});

test("Voice realtime relay on main is bound to the load-balanced Safe Lease", () => {
  assert.match(relay, /from "\.\.\/_shared\/avantiqo-voice-realtime-safe-lease\.ts"/);
  assert.match(relay, /realtimeLease = await acquireVoiceRealtimeSafeLease\(/);
  assert.match(relay, /endpointId: realtimeEndpointIdFromWebSocketUrl\(runpodUrl\)/);
  assert.match(relay, /ttlSeconds: 120/);
  assert.match(relay, /leaseRefreshTimer = setInterval/);
  assert.match(relay, /lease\.refresh\(\)/);
  assert.match(relay, /await lease\.release\(reason\)/);
  assert.match(relay, /await lease\.fail\(reason\)/);
  assert.match(relay, /await failedLease\.fail\("relay setup failed"\)/);
  assert.match(relay, /if \(finishPromise\) return finishPromise/);
  assert.match(relay, /edgeRuntime\?\.waitUntil\?\.\(closedPromise\)/);
  assert.doesNotMatch(relay, /\/run\b/);
  assert.doesNotMatch(relay, /\/health\b/);
  assert.doesNotMatch(relay, /purge-queue/);
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
