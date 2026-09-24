import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const provider = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoAudioProvider.js", "utf8");
const registration = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoAudioProviderRegistration.js", "utf8");

test("active Audio routing is owned Node01 only", () => {
  assert.match(provider, /AvantiqoMusicGenerationLocalQueueProvider/);
  assert.match(provider, /AvantiqoSfxLocalQueueProvider/);
  assert.match(provider, /AvantiqoMusicSeparatorLocalQueueProvider/);
  assert.match(provider, /AvantiqoMusicElasticLocalQueueProvider/);
  assert.match(provider, /AvantiqoMusicVocalCorrectionLocalQueueProvider/);
  assert.doesNotMatch(provider, /Modal|RunPod|SAFE_LEASE/);
  assert.match(registration, /infrastructure_provider:"AVANTIQO_LOCAL_NODE_V1"/);
  assert.match(registration, /local_only_execution:true/);
  assert.match(registration, /modal_fallback_allowed:false/);
  assert.match(registration, /external_provider_fallback_allowed:false/);
});

test("Audio registration exposes only local queue transport", () => {
  assert.match(registration, /transport:"supabase-pull-queue-v1"/);
  assert.match(registration, /queue_endpoint:true/);
  assert.match(registration, /local_compute_configured:localComputeConfigured/);
});
