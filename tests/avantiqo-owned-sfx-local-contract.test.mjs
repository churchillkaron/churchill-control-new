import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const registration = await readFile("lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoAudioProviderRegistration.js", "utf8");
const provider = await readFile("lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoSfxLocalQueueProvider.js", "utf8");
const audio = await readFile("lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoAudioProvider.js", "utf8");

test("owned SFX is certification-gated and local-only", () => {
  assert.match(registration, /AVANTIQO_SFX_ENGINE_CERTIFIED/);
  assert.match(registration, /AVANTIQO_SFX_CERTIFICATION_EVIDENCE_SHA256/);
  assert.match(registration, /infrastructure_provider: "AVANTIQO_LOCAL_NODE_V1"/);
  assert.match(registration, /cloud_fallback_allowed: false/);
  assert.match(provider, /AVANTIQO_SFX_LOCAL_NODE_UNAVAILABLE/);
  assert.match(provider, /workload: "sfx_generate"/);
  assert.doesNotMatch(audio, /Modal|modal|RunPod|runpod|fal-ai/);
});

test("ai.sfx.generate routes through the local SFX queue provider", () => {
  assert.match(audio, /AvantiqoSfxLocalQueueProvider/);
  assert.match(audio, /"ai\.sfx\.generate"/);
  assert.match(provider, /OpenMOSS-Team\/MOSS-SoundEffect-v2\.0/);
  assert.match(provider, /AVANTIQO_LOCAL_NODE_V1/);
});
