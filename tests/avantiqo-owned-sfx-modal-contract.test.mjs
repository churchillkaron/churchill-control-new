import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// Legacy filename retained for repository mission-safety. SFX now runs only on the local queue.
const audio = await readFile("lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoAudioProvider.js", "utf8");
const local = await readFile("lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoSfxLocalQueueProvider.js", "utf8");

test("legacy SFX contract enforces Node01 local execution", () => {
  assert.match(audio, /AvantiqoSfxLocalQueueProvider/);
  assert.match(local, /AVANTIQO_SFX_LOCAL_NODE_UNAVAILABLE/);
  assert.match(local, /AVANTIQO_LOCAL_NODE_V1/);
  assert.doesNotMatch(audio, /Modal|modal|RunPod|runpod|fal-ai/);
});
