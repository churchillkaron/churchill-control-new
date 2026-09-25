import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// Legacy filename retained for repository mission-safety. Elastic audio now runs only locally.
const audio = await readFile("lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoAudioProvider.js", "utf8");
const local = await readFile("lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoMusicElasticLocalQueueProvider.js", "utf8");

test("legacy elastic-audio contract enforces local execution", () => {
  assert.match(audio, /AvantiqoMusicElasticLocalQueueProvider/);
  assert.match(local, /AVANTIQO_MUSIC_ELASTIC_LOCAL_NODE_UNAVAILABLE/);
  assert.match(local, /AVANTIQO_LOCAL_NODE_V1/);
  assert.doesNotMatch(audio, /Modal|modal/);
});
