import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const provider = await readFile("lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoMusicElasticLocalQueueProvider.js", "utf8");
const audio = await readFile("lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoAudioProvider.js", "utf8");
const registration = await readFile("lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoAudioProviderRegistration.js", "utf8");

test("elastic audio runs only through the local worker", () => {
  assert.match(provider, /AVANTIQO_MUSIC_ELASTIC_LOCAL_NODE_UNAVAILABLE/);
  assert.match(provider, /workload: "music_elastic"/);
  assert.match(provider, /signalsmith-stretch/);
  assert.match(audio, /AvantiqoMusicElasticLocalQueueProvider/);
  assert.match(registration, /capability: "ai\.audio\.elastic-warp"/);
  assert.match(registration, /infrastructure_provider: "AVANTIQO_LOCAL_NODE_V1"/);
  assert.doesNotMatch(audio, /Modal|modal/);
});
