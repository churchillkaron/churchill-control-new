import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("Operator STT uses durable distributed Safe Lease V2 jobs without persisting audio", async () => {
  const runtime = await source("lib/operator/runtime/OperatorVoiceAsyncTranscriptionRuntime.js");
  const route = await source("app/api/operator/transcribe/route.js");

  assert.match(runtime, /const LANE = "voice-stt"/);
  assert.match(runtime, /const CAPABILITY = "ai\.speech\.to\.text"/);
  assert.match(runtime, /acquireVoiceRunpodWebLease/);
  assert.match(runtime, /runpod_safe_lease: lease/);
  assert.match(runtime, /ServiceExecutionRuntime\.execute/);
  assert.match(runtime, /ServiceExecutionRuntime\.settle/);
  assert.match(runtime, /audio_persisted: false/);
  assert.doesNotMatch(runtime, /audio_base64\s*:/);
  assert.match(runtime, /\.eq\("organization_id", organizationId\)/);
  assert.match(runtime, /\.eq\("capability", CAPABILITY\)/);
  assert.match(runtime, /\.eq\("lane", LANE\)/);

  assert.match(route, /startOperatorAsyncTranscription/);
  assert.match(route, /pollOperatorAsyncTranscription/);
  assert.match(route, /export async function GET/);
  assert.match(route, /status: 202/);
  assert.match(route, /Retry-After/);
  assert.match(route, /requireOrganizationAccess/);
  assert.match(route, /resolveBusinessContext/);
});

test("TTS async cancellation cancels only the captured provider job and never purges a queue", async () => {
  const runtime = await source("lib/operator/runtime/OperatorVoiceAsyncSpeechRuntime.js");
  const route = await source("app/api/operator/speak/jobs/route.js");
  const leaseRuntime = await source("lib/platform/service-runtime/providers/avantiqo-voice/AvantiqoVoiceRunpodLeaseRuntime.js");

  assert.match(runtime, /cancelOperatorAsyncSpeech/);
  assert.match(runtime, /cancelExactJob: Boolean\(job\.provider_job_id\)/);
  assert.match(runtime, /status: "CANCELLED"/);
  assert.match(runtime, /blind_queue_purge_requested: false/);
  assert.match(route, /export async function DELETE/);
  assert.match(route, /OperatorVoiceAsyncSpeechRuntime\.cancel/);
  assert.match(route, /organizationAccess\(request, organizationId\)/);
  assert.doesNotMatch(leaseRuntime, /purge-queue/);
});

test("Voice proof, readiness and smoke all require exact Safe Lease V2", async () => {
  const proof = await source("scripts/run-avantiqo-voice-tts-v3-one-proof-local.mjs");
  const readiness = await source("scripts/check-avantiqo-voice-tts-v3-readiness-local.mjs");
  const smoke = await source("scripts/smoke-avantiqo-voice-tts-cold-start-local.mjs");

  for (const value of [proof, readiness, smoke]) {
    assert.match(value, /AVANTIQO_RUNPOD_SAFE_LEASE_V2/);
    assert.match(value, /AVANTIQO_RUNPOD_SAFE_LEASE_ACTIVE/);
    assert.match(value, /AVANTIQO_RUNPOD_SAFE_LEASE_LANE/);
    assert.match(value, /voice-tts/);
    assert.match(value, /AVANTIQO_RUNPOD_SAFE_LEASE_ENDPOINT_ID/);
    assert.match(value, /AVANTIQO_RUNPOD_SAFE_LEASE_EXPIRES_AT/);
  }

  assert.match(smoke, /requireSafeLeaseV2\(endpointId\);[\s\S]*?rawRequest\(endpointId, "\/run"/);
});

test("Voice readiness models true 0\/1 serverless cold start", async () => {
  const readiness = await source("scripts/check-avantiqo-voice-tts-v3-readiness-local.mjs");

  assert.match(readiness, /AVANTIQO_VOICE_TTS_V3_READINESS_V4/);
  assert.match(readiness, /zero_live_workers_allowed: true/);
  assert.match(readiness, /serverless_cold_start_ready/);
  assert.doesNotMatch(readiness, /READY_WORKER_NOT_STABLY_VISIBLE/);
  assert.match(readiness, /WORKERS_MIN_NOT_ZERO/);
  assert.match(readiness, /WORKERS_MAX_NOT_ONE_UNDER_SAFE_LEASE/);
  assert.match(readiness, /JOBS_IN_QUEUE/);
  assert.match(readiness, /JOBS_IN_PROGRESS/);
  assert.match(readiness, /STALE_WORKER_PRESENT/);
  assert.match(readiness, /LIVE_WORKER_IMAGE_MISMATCH/);
  assert.match(readiness, /TERMINAL_WORKER_STATUSES = new Set\(\["EXITED", "STOPPED", "TERMINATED", "DELETED"\]\)/);
  assert.match(readiness, /function nonTerminalControlWorkers\(workers\)/);
  assert.match(readiness, /function activeManagementWorkers\(workers\)/);
  assert.match(readiness, /function reconcileControlWorkers\(workerRecords, managementActiveWorkers, health\)/);
  assert.match(readiness, /worker\.is_stale === true && noLiveManagementWorker && noHealthWorker && noJobs/);
  assert.match(readiness, /stale_control_ghost_records_ignored/);
  assert.match(readiness, /zero_live_workers_observed/);
  assert.match(readiness, /terminal_worker_history_ignored: true/);
  assert.match(readiness, /stale_control_ghost_history_ignored_only_when_live_planes_are_zero: true/);
  assert.match(readiness, /CONTROL_HEALTH_WORKER_STATE_DISAGREEMENT/);
  assert.match(readiness, /MANAGEMENT_HEALTH_WORKER_STATE_DISAGREEMENT/);
  assert.match(readiness, /CONTROL_MANAGEMENT_WORKER_STATE_DISAGREEMENT/);
});