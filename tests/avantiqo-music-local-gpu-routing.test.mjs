import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const audio = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoAudioProvider.js", "utf8");
const separator = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoMusicSeparatorLocalQueueProvider.js", "utf8");
const vocal = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoMusicVocalCorrectionLocalQueueProvider.js", "utf8");
const worker = fs.readFileSync("scripts/local-node/avantiqo-node01-worker.ps1", "utf8");
const compute = fs.readFileSync("app/api/workspace/administration/compute/route.js", "utf8");

test("music stems and vocal correction use Node01 exact production models", () => {
  assert.match(audio, /AvantiqoMusicSeparatorLocalQueueProvider/);
  assert.match(audio, /AvantiqoMusicVocalCorrectionLocalQueueProvider/);
  assert.match(separator, /MODEL = "demucs-htdemucs-ft"/);
  assert.match(separator, /AVANTIQO_MUSIC_SEPARATOR_ENGINE_V1/);
  assert.match(vocal, /MODEL="torchcrepe-full"/);
  assert.match(vocal, /AVANTIQO_MUSIC_VOCAL_CORRECTION_ENGINE_V2/);
  assert.match(separator, /lane:"gpu"/);
  assert.match(vocal, /lane:"gpu"/);
});

test("Node01 worker owns the GPU specialist music workloads", () => {
  assert.match(worker, /'ai\.audio\.stems'/);
  assert.match(worker, /'ai\.audio\.vocal-correct'/);
  assert.match(worker, /RunMusicSeparatorJob/);
  assert.match(worker, /RunMusicVocalCorrectionJob/);
});

test("Compute administration identifies current music routing", () => {
  assert.match(compute, /usage\.startsWith\("node01-music-"\)/);
  assert.match(compute, /LOCAL_GPU_DEMUCS_TORCHCREPE_FIRST/);
  assert.match(compute, /music_generation: "LOCAL_ONLY"/);
});
