import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = (path) => fs.readFileSync(path, "utf8");
const jobs = source("lib/operator/runtime/OperatorVoiceAsyncJobRuntime.js");
const runtime = source("lib/operator/runtime/OperatorVoiceAsyncTranscriptionRuntime.js");
const provider = source("lib/platform/service-runtime/providers/avantiqo-voice/AvantiqoVoiceProviderV2.js");
const localStt = source("lib/platform/service-runtime/providers/avantiqo-voice/AvantiqoVoiceSttLocalQueueProvider.js");
const route = source("app/api/operator/transcribe/route.js");
const client = source("lib/operator/voice/AsyncRecordedTranscriptionClient.js");

test("Operator STT uses durable local owned Voice jobs without persisting audio in its job ledger", () => {
  assert.match(runtime, /const LANE = "voice-stt"/);
  assert.match(runtime, /const CAPABILITY = "ai\.speech\.to\.text"/);
  assert.match(runtime, /insertVoiceAsyncJob/);
  assert.match(runtime, /submitVoiceService/);
  assert.match(runtime, /settleVoiceJob/);
  assert.doesNotMatch(jobs, /audio_base64\s*:/);
  assert.match(jobs, /\.eq\("organization_id", organizationId\)/);
  assert.match(jobs, /\.eq\("capability", capability\)/);
  assert.match(jobs, /\.eq\("lane", lane\)/);
});

test("STT provider is Node01-only and exact-job cancelable", () => {
  assert.match(provider, /AvantiqoVoiceSttLocalQueueProvider\.available/);
  assert.match(provider, /AvantiqoVoiceSttLocalQueueProvider\.execute/);
  assert.match(provider, /isVoiceSttLocalJob/);
  assert.match(provider, /AvantiqoVoiceSttLocalQueueProvider\.cancel/);
  assert.match(localStt, /const MODEL = "openai\/whisper-large-v3-turbo"/);
  assert.match(localStt, /\.eq\("id", rawJobId\(jobId\)\)/);
  assert.match(localStt, /exact_job_only: true/);
  assert.doesNotMatch(provider, /RunPod|Safe Lease|executeVoiceModalDirect/);
});

test("transcription API and browser client use bounded authenticated async polling", () => {
  assert.match(route, /requireOrganizationAccess/);
  assert.match(route, /export async function POST/);
  assert.match(route, /export async function GET/);
  assert.match(route, /export async function DELETE/);
  assert.match(route, /status: 202/);
  assert.match(route, /Retry-After/);
  assert.match(client, /\/api\/operator\/transcribe/);
  assert.match(client, /method: "DELETE"/);
  assert.doesNotMatch(client, /runpod|modal/i);
});
