import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const jobs = fs.readFileSync("lib/operator/runtime/OperatorVoiceAsyncJobRuntime.js", "utf8");
const provider = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-voice/AvantiqoVoiceProviderV2.js", "utf8");
const registration = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-voice/AvantiqoVoiceProviderRegistration.js", "utf8");

test("Operator Voice execution is pinned to the owned provider", () => {
  assert.match(jobs, /const OWNED_PROVIDER = "avantiqo-voice"/);
  assert.match(jobs, /owned_only_required: true/);
  assert.match(jobs, /external_fallback_allowed: false/);
  assert.match(jobs, /provider_id: OWNED_PROVIDER/);
  assert.match(jobs, /allowed_providers: Object\.freeze\(\[OWNED_PROVIDER\]\)/);
});

test("active Voice provider opens no RunPod or Modal capacity", () => {
  assert.match(provider, /AvantiqoVoiceSttLocalQueueProvider/);
  assert.match(provider, /AvantiqoVoiceTtsLocalQueueProvider/);
  assert.match(provider, /AVANTIQO_VOICE_LOCAL_NODE_UNAVAILABLE/);
  assert.match(registration, /infrastructure_provider: "AVANTIQO_LOCAL_NODE_V1"/);
  assert.match(registration, /local_only_execution: true/);
  assert.doesNotMatch(provider, /RunPod|Safe Lease|Modal|acquireVoiceRunpodWebLease/i);
});
