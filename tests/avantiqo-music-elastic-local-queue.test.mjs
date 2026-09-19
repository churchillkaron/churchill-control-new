import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const provider = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoAudioProvider.js", "utf8");
const local = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoMusicElasticLocalQueueProvider.js", "utf8");
const worker = fs.readFileSync("scripts/local-node/avantiqo-node01-worker.ps1", "utf8");
const runner = fs.readFileSync("services/avantiqo-music-elastic-engine/local_runner.py", "utf8");

test("Music Elastic prefers the owned local queue and retains Modal fallback", () => {
  assert.match(provider, /AvantiqoMusicElasticLocalQueueProvider\.available/);
  assert.match(provider, /AvantiqoMusicElasticLocalQueueProvider\.execute/);
  assert.match(provider, /AVANTIQO_MUSIC_ELASTIC_LOCAL_FALLBACK_MODAL/);
  assert.match(provider, /AvantiqoMusicElasticModalProvider\.execute/);
});

test("Music Elastic local queue is governed and capability-scoped", () => {
  assert.match(local, /ai\.audio\.elastic-warp/);
  assert.match(local, /avantiqo_local_compute_nodes/);
  assert.match(local, /contains\("capabilities", \[CAPABILITY\]\)/);
  assert.match(local, /avantiqo_local_compute_jobs/);
  assert.match(local, /lane: "cpu"/);
  assert.match(local, /workload: "music_elastic"/);
});

test("Node 01 worker executes the certified Signalsmith engine locally", () => {
  assert.match(worker, /ai\.audio\.elastic-warp/);
  assert.match(worker, /RunElasticJob/);
  assert.match(worker, /C:\\Avantiqo\\Python312\\python\.exe/);
  assert.match(worker, /C:\\Avantiqo\\ffmpeg\\bin/);
  assert.match(worker, /signalsmith-stretch/);
  assert.match(runner, /MUSICIAN_APPROVED_WARP_PLAN|approved_warp_plan/);
  assert.match(runner, /source_audio_url/);
  assert.match(runner, /output_upload_url/);
});
