import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = (path) => fs.readFileSync(path, "utf8");
const jobs = source("lib/operator/runtime/OperatorVoiceAsyncJobRuntime.js");
const speech = source("lib/operator/runtime/OperatorVoiceAsyncSpeechRuntime.js");
const provider = source("lib/platform/service-runtime/providers/avantiqo-voice/AvantiqoVoiceProviderV2.js");
const localTts = source("lib/platform/service-runtime/providers/avantiqo-voice/AvantiqoVoiceTtsLocalQueueProvider.js");
const route = source("app/api/operator/speak/jobs/route.js");
const client = source("lib/operator/voice/AsyncSpeechClient.js");
const operator = source("components/operator/AvantiqoOperator.jsx");

test("async Voice jobs are organization-scoped durable service jobs", () => {
  assert.match(jobs, /avantiqo_voice_async_jobs/);
  assert.match(jobs, /allowed_providers: Object\.freeze\(\[OWNED_PROVIDER\]\)/);
  assert.match(jobs, /external_fallback_allowed: false/);
  assert.match(speech, /const LANE = "voice-tts"/);
  assert.match(speech, /const CAPABILITY = "ai\.text\.to\.speech"/);
  assert.match(speech, /insertVoiceAsyncJob/);
  assert.match(speech, /submitVoiceService/);
  assert.match(speech, /settleVoiceJob/);
});

test("async speech uses local owned Voice and private output storage", () => {
  assert.match(provider, /AvantiqoVoiceTtsLocalQueueProvider\.available/);
  assert.match(provider, /AvantiqoVoiceTtsLocalQueueProvider\.execute/);
  assert.match(localTts, /createSignedUploadUrl/);
  assert.match(localTts, /storage:\/\/\$\{OUTPUT_BUCKET\}/);
  assert.match(localTts, /local_tts_mode: "LOCAL_GPU_ONLY"/);
  assert.doesNotMatch(provider, /RunPod|Safe Lease|executeVoiceModalDirect/);
});

test("async speech cancellation targets only its exact local provider job", () => {
  assert.match(jobs, /ServiceExecutionRuntime\.cancelPending/);
  assert.match(jobs, /provider_job_id: job\.provider_job_id/);
  assert.match(jobs, /usage_id: job\.usage_id/);
  assert.match(jobs, /exact_provider_job_cancel_requested: Boolean\(job\.provider_job_id\)/);
  assert.match(jobs, /blind_queue_purge_requested: false/);
  assert.match(provider, /async cancel\(input = \{\}\)/);
  assert.match(localTts, /\.eq\("id", rawJobId\(jobId\)\)/);
  assert.match(localTts, /\.in\("status", \["QUEUED", "RUNNING"\]\)/);
  assert.match(localTts, /exact_job_only: true/);
});

test("Operator async speech API and client are bounded and organization-authorized", () => {
  assert.match(route, /requireOrganizationAccess/);
  assert.match(route, /export async function POST/);
  assert.match(route, /export async function GET/);
  assert.match(route, /export async function DELETE/);
  assert.match(route, /OperatorVoiceAsyncSpeechRuntime\.start/);
  assert.match(route, /OperatorVoiceAsyncSpeechRuntime\.poll/);
  assert.match(route, /OperatorVoiceAsyncSpeechRuntime\.cancel/);
  assert.match(route, /"Retry-After": "2"/);
  assert.match(client, /\/api\/operator\/speak\/jobs/);
  assert.match(client, /method: "DELETE"/);
  assert.doesNotMatch(client, /runpod|modal/i);
});

test("voice turns speak while typed turns remain silent", () => {
  assert.match(operator, /if \(source === "voice" && assistantText\)/);
  assert.match(operator, /requestAsyncSpeechBlob/);
  assert.match(operator, /signal: abortController\.signal/);
});
