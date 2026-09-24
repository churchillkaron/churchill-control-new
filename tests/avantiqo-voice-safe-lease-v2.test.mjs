import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const provider = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-voice/AvantiqoVoiceProviderV2.js", "utf8");
const registration = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-voice/AvantiqoVoiceProviderRegistration.js", "utf8");
const stt = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-voice/AvantiqoVoiceSttLocalQueueProvider.js", "utf8");
const tts = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-voice/AvantiqoVoiceTtsLocalQueueProvider.js", "utf8");

test("legacy RunPod Safe Lease is retired from active Voice execution", () => {
  assert.doesNotMatch(provider, /RUNPOD_SAFE_LEASE|RunPod|acquireVoiceRunpod|safe_lease/i);
  assert.doesNotMatch(registration, /RUNPOD_SAFE_LEASE|RunPod|safe_lease/i);
  assert.match(provider, /AVANTIQO_VOICE_LEGACY_JOB_TRANSPORT_RETIRED/);
});

test("Voice capabilities use dedicated local queue job identities", () => {
  assert.match(stt, /AVANTIQO_VOICE_STT_LOCAL_JOB_PREFIX = "local-voice-stt:"/);
  assert.match(tts, /AVANTIQO_VOICE_TTS_LOCAL_JOB_PREFIX = "local-voice-tts:"/);
  assert.match(stt, /workload: "voice_stt"/);
  assert.match(tts, /workload: "voice_tts"/);
  assert.match(registration, /transport:|local_compute_configured|AVANTIQO_LOCAL_NODE_V1/);
});

test("local Voice job cancellation is exact-job and organization scoped", () => {
  for (const source of [stt, tts]) {
    assert.match(source, /\.eq\("id", rawJobId\(jobId\)\)/);
    assert.match(source, /\.eq\("organization_id", organizationId\)/);
    assert.match(source, /exact_job_only: true/);
    assert.doesNotMatch(source, /purge-queue/);
  }
});
