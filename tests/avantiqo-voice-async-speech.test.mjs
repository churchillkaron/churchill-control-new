import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

function source(path) {
  return fs.readFileSync(path, "utf8");
}

const migration = source("supabase/migrations/20260826102500_avantiqo_voice_async_runpod_lease.sql");
const leaseRuntime = source("lib/platform/service-runtime/providers/avantiqo-voice/AvantiqoVoiceRunpodLeaseRuntime.js");
const provider = source("lib/platform/service-runtime/providers/avantiqo-voice/AvantiqoVoiceProvider.js");
const asyncRuntime = source("lib/operator/runtime/OperatorVoiceAsyncSpeechRuntime.js");
const jobsRoute = source("app/api/operator/speak/jobs/route.js");
const speechClient = source("lib/operator/voice/AsyncSpeechClient.js");
const reaperRoute = source("app/api/internal/voice/runpod-leases/process/route.js");
const operator = source("components/operator/AvantiqoOperator.jsx");
const vercel = source("vercel.json");
const localLease = source("scripts/run-avantiqo-runpod-safe-lease-v2-local.mjs");

test("Voice distributed lease state is service-role-only and audio-free", () => {
  assert.match(migration, /create table if not exists public\.avantiqo_voice_runpod_leases/);
  assert.match(migration, /create table if not exists public\.avantiqo_voice_async_jobs/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /grant .*service_role/is);
  assert.doesNotMatch(migration, /audio_base64\s+(text|bytea)/i);
  assert.match(migration, /where state = 'ACTIVE'/);
  assert.match(migration, /check \(lane in \('voice-tts', 'voice-stt'\)\)/);
  assert.match(migration, /p_lane not in \('voice-tts', 'voice-stt'\)/);
});

test("web Voice lease opens and closes only the exact endpoint", () => {
  assert.match(leaseRuntime, /acquire_avantiqo_voice_runpod_lease_v2/);
  assert.match(leaseRuntime, /await acquireDatabaseLease/);
  assert.match(leaseRuntime, /await patchScaling\(endpointId, 1\)/);
  assert.match(leaseRuntime, /await patchScaling\(endpointId, 0\)/);
  assert.match(leaseRuntime, /\/cancel\/\$\{encodeURIComponent\(providerJobId\)\}/);
  assert.doesNotMatch(leaseRuntime, /purge-queue/);
  assert.match(leaseRuntime, /MAX_CONCURRENT_PAID_LEASES = 4/);
  assert.match(leaseRuntime, /MAX_ACCOUNT_HOURLY_USD = 4/);
  assert.match(leaseRuntime, /workers_min !== 0/);
  assert.match(leaseRuntime, /!\[0, 1\]\.includes\(row\.workers_max\)/);
});

test("Voice provider validates database leases and retains local V2 certification", () => {
  assert.match(provider, /validateVoiceRunpodDistributedLease/);
  assert.match(provider, /mode: "DISTRIBUTED_DATABASE"/);
  assert.match(provider, /mode: "LOCAL_CONTROLLER_ENV"/);
  assert.match(provider, /AVANTIQO_RUNPOD_SAFE_LEASE_V2/);
  assert.match(provider, /safeLeaseLaneForCapability/);
  assert.match(provider, /await requireSafeLeaseForSubmission\(endpointId, capability, input\)/);
});

test("async Operator speech preserves governed execution and settlement", () => {
  assert.match(asyncRuntime, /ServiceExecutionRuntime\.execute/);
  assert.match(asyncRuntime, /ServiceExecutionRuntime\.settle/);
  assert.match(asyncRuntime, /avantiqo_voice_async_jobs/);
  assert.match(asyncRuntime, /runpod_safe_lease: lease/);
  assert.match(asyncRuntime, /voice_library_profile_id/);
  assert.match(asyncRuntime, /voice_profile/);
  assert.match(asyncRuntime, /Buffer\.from\(encoded, "base64"\)/);
  assert.doesNotMatch(asyncRuntime, /audio_base64\s*:/);
});

test("Operator async speech API is organization-scoped on start and poll", () => {
  assert.match(jobsRoute, /requireOrganizationAccess/);
  assert.match(jobsRoute, /export async function POST/);
  assert.match(jobsRoute, /export async function GET/);
  assert.match(jobsRoute, /OperatorVoiceAsyncSpeechRuntime\.start/);
  assert.match(jobsRoute, /OperatorVoiceAsyncSpeechRuntime\.poll/);
  assert.match(jobsRoute, /"Content-Type": "audio\/wav"/);
  assert.match(jobsRoute, /status: 202/);
});

test("voice turns speak while typed turns remain silent", () => {
  assert.match(operator, /sendMessage\(result\.transcript, "voice"\)/);
  assert.match(operator, /if \(source === "voice" && assistantText\)/);
  assert.match(operator, /await requestSpokenReply\(assistantText\)/);
  assert.match(operator, /requestAsyncSpeechBlob/);
  assert.match(operator, /signal: abortController\.signal/);
  assert.match(speechClient, /\/api\/operator\/speak\/jobs/);
  assert.match(speechClient, /method: "DELETE"/);
  assert.doesNotMatch(speechClient, /https:\/\/api\.runpod\.ai/);
  assert.doesNotMatch(operator, /fetch\("https:\/\/api\.runpod\.ai/);
  assert.match(operator, /async function sendMessage\(rawValue, source = "text"\)/);
  assert.match(operator, /voiceLibraryOpenRef\.current/);
  assert.match(operator, /speakingRef\.current/);
  assert.match(operator, /wakeSuspendedRef\.current = true/);
});

test("expired Voice leases are reaped by authenticated minute cron without blind purge", () => {
  assert.match(reaperRoute, /process\.env\.CRON_SECRET/);
  assert.match(reaperRoute, /reapExpiredVoiceRunpodLeases/);
  assert.match(reaperRoute, /blind_queue_purge_performed: false/);
  assert.match(vercel, /\/api\/internal\/voice\/runpod-leases\/process/);
  assert.match(vercel, /"schedule": "\* \* \* \* \*"/);
});

test("local V2 watchdog recognizes distributed Voice leases", () => {
  assert.match(localLease, /listActiveVoiceRunpodDistributedLeases/);
  assert.match(localLease, /distributedVoiceLeases/);
  assert.match(localLease, /acquireVoiceRunpodDistributedLease/);
  assert.match(localLease, /releaseVoiceRunpodDistributedLease/);
  assert.match(localLease, /endpointOpened/);
});
