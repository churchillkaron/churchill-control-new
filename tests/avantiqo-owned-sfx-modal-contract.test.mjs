import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const audio = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoAudioProvider.js", "utf8");
const local = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoSfxLocalQueueProvider.js", "utf8");
const policy = fs.readFileSync("lib/platform/service-runtime/providers/AvantiqoOwnedCertificationPolicy.js", "utf8");

test("owned SFX production routing is local-only", () => {
  assert.match(audio, /AvantiqoSfxLocalQueueProvider/);
  assert.match(audio, /AVANTIQO_SFX_LOCAL_NODE_UNAVAILABLE/);
  assert.match(local, /CAPABILITY = "ai\.sfx\.generate"/);
  assert.match(local, /OpenMOSS-Team\/MOSS-SoundEffect-v2\.0/);
  assert.match(local, /lane: "cpu"/);
  assert.match(local, /workload: "sfx_generate"/);
  assert.match(local, /AVANTIQO_SFX_ENGINE_V1/);
  assert.doesNotMatch(audio, /AvantiqoSfxModalProvider|createAvantiqoOwnedModalWorker|RunPod|fal-ai|FAL_/i);
});

test("MOSS SFX model remains governed", () => {
  assert.match(policy, /OpenMOSS-Team\/MOSS-SoundEffect-v2\.0/);
  assert.match(policy, /apache-2\.0/);
});
