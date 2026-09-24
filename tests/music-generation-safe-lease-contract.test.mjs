import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const audio = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoAudioProvider.js", "utf8");
const generation = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoMusicGenerationLocalQueueProvider.js", "utf8");
const certifier = fs.readFileSync("scripts/certify-avantiqo-music-local.sh", "utf8");

test("Music generation no longer depends on Safe Lease or RunPod", () => {
  assert.doesNotMatch(audio, /RunPod|SAFE_LEASE|runpod/);
  assert.match(audio, /AvantiqoMusicGenerationLocalQueueProvider/);
  assert.match(generation, /AVANTIQO_LOCAL_NODE_V1/);
  assert.match(generation, /ACE-Step\/Ace-Step1\.5/);
});

test("local Music certification remains explicit and non-activating by default", () => {
  assert.match(certifier, /AVANTIQO_MUSIC/);
  assert.doesNotMatch(certifier, /workersMax|runpod|safe.lease/i);
});
