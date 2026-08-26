import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const providerUrl = new URL(
  "../lib/platform/service-runtime/providers/avantiqo-voice/AvantiqoVoiceProvider.js",
  import.meta.url,
);
const launcherUrl = new URL(
  "../scripts/run-avantiqo-voice-tts-v3-one-proof-safe-lease-v2-local.mjs",
  import.meta.url,
);
const policyUrl = new URL(
  "../config/avantiqo-runpod-safe-lease-policy.json",
  import.meta.url,
);

test("Voice provider requires exact RunPod Safe Lease V2 before submission", async () => {
  const source = await readFile(providerUrl, "utf8");
  assert.match(source, /AVANTIQO_RUNPOD_SAFE_LEASE_V2/);
  assert.match(source, /AVANTIQO_RUNPOD_SAFE_LEASE_CONTRACT/);
  assert.match(source, /AVANTIQO_RUNPOD_SAFE_LEASE_EXPIRES_AT/);
  assert.match(source, /AVANTIQO_VOICE_RUNPOD_SAFE_LEASE_EXPIRED_OR_EXPIRING/);
  assert.match(source, /await requireSafeLeaseForSubmission\(endpointId, capability, input\)/);
  assert.match(source, /input\.runpod_safe_lease \|\| input\.runpodSafeLease/);
  assert.match(source, /validateVoiceRunpodDistributedLease/);
  assert.match(source, /submitJob\(\{\s*endpointId,\s*capability,/s);
});

test("Voice capabilities map to dedicated V2 lease lanes", async () => {
  const source = await readFile(providerUrl, "utf8");
  assert.match(source, /ai\.text\.to\.speech"\) return "voice-tts"/);
  assert.match(source, /ai\.speech\.to\.text"\) return "voice-stt"/);
  assert.match(source, /AVANTIQO_VOICE_RUNPOD_SAFE_LEASE_LANE_MISMATCH/);

  const policy = JSON.parse(await readFile(policyUrl, "utf8"));
  assert.equal(policy.contract, "AVANTIQO_RUNPOD_SAFE_LEASE_POLICY_V2");
  assert.equal(policy.parallel_work_allowed, true);
  assert.equal(policy.workers_min_one_allowed, false);
  assert.equal(policy.lanes["voice-tts"], "avantiqo-voice-tts-v1");
  assert.equal(policy.lanes["voice-stt"], "avantiqo-voice-stt-v1");
});

test("canonical Voice TTS proof launcher always delegates through V2", async () => {
  const source = await readFile(launcherUrl, "utf8");
  assert.match(source, /run-avantiqo-runpod-safe-lease-v2-local\.mjs/);
  assert.match(source, /const LANE = "voice-tts"/);
  assert.match(source, /AVANTIQO_RUNPOD_SAFE_LEASE_APPROVED=YES_REQUIRED/);
  assert.match(source, /AVANTIQO_VOICE_TTS_V3_ONE_PROOF_APPROVED=YES_REQUIRED/);
  assert.match(source, /--lane=\$\{LANE\}/);
  assert.match(source, /permanent_rest_state: "VOICE_TTS_0_0"/);
  assert.doesNotMatch(source, /run-avantiqo-runpod-safe-lease-local\.mjs/);
});