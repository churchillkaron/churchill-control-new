import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const audio = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoAudioProvider.js", "utf8");
const local = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoMusicElasticLocalQueueProvider.js", "utf8");

test("Elastic audio production routing is local Signalsmith only", () => {
  assert.match(audio, /AvantiqoMusicElasticLocalQueueProvider/);
  assert.match(audio, /AVANTIQO_MUSIC_ELASTIC_LOCAL_NODE_UNAVAILABLE/);
  assert.match(local, /CAPABILITY = "ai\.audio\.elastic-warp"/);
  assert.match(local, /MODEL = "signalsmith-stretch"/);
  assert.match(local, /lane: "cpu"/);
  assert.match(local, /workload: "music_elastic"/);
  assert.match(local, /AVANTIQO_MUSIC_ELASTIC_AUDIO_ENGINE_V1/);
  assert.doesNotMatch(audio, /AvantiqoMusicElasticModalProvider|Modal|RunPod/);
});
