import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(path, "utf8");
const audio = read("lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoAudioProvider.js");
const separator = read("lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoMusicSeparatorLocalQueueProvider.js");
const vocal = read("lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoMusicVocalCorrectionLocalQueueProvider.js");
const worker = read("scripts/local-node/avantiqo-node01-worker.ps1");
const separatorRunner = read("scripts/local-node/avantiqo-node01-music-separator-runner.py");
const vocalRunner = read("scripts/local-node/avantiqo-node01-music-vocal-correction-runner.py");
const installer = read("scripts/local-node/install-avantiqo-node01-workers.ps1");
const compute = read("app/api/workspace/administration/compute/route.js");

test("music stems and vocal correction prefer Node 01 with exact production models", () => {
  assert.match(audio, /AvantiqoMusicSeparatorLocalQueueProvider\.available/);
  assert.match(audio, /AVANTIQO_MUSIC_SEPARATOR_LOCAL_FALLBACK_MODAL/);
  assert.match(audio, /AvantiqoMusicVocalCorrectionLocalQueueProvider\.available/);
  assert.match(audio, /AVANTIQO_MUSIC_VOCAL_CORRECTION_LOCAL_FALLBACK_MODAL/);
  assert.match(separator, /demucs-htdemucs-ft/);
  assert.match(separator, /AVANTIQO_MUSIC_SEPARATOR_ENGINE_V1/);
  assert.match(vocal, /torchcrepe-full/);
  assert.match(vocal, /AVANTIQO_MUSIC_VOCAL_CORRECTION_ENGINE_V2/);
  assert.match(separator, /createSignedUploadUrl\(path,\{upsert:true\}\)/);
  assert.match(vocal, /createSignedUploadUrl\(path,\{upsert:true\}\)/);
});

test("Node 01 serializes all GPU engines and keeps CPU media separate", () => {
  assert.match(worker, /'ai\.audio\.stems'/);
  assert.match(worker, /'ai\.audio\.vocal-correct'/);
  assert.match(worker, /RunMusicSeparatorJob/);
  assert.match(worker, /RunMusicVocalCorrectionJob/);
  assert.match(worker, /Get-Process -Name 'llama-server'/);
  assert.match(separatorRunner, /demucs-htdemucs-ft/);
  assert.match(separatorRunner, /redirect_stdout\(sys\.stderr\)/);
  assert.match(vocalRunner, /import_module\('handler_v2'\)/);
  assert.match(installer, /-Lane cpu/);
  assert.match(installer, /-Lane gpu/);
  assert.match(installer, /AvantiqoGpuWorker/);
});

test("compute UI identifies music GPU work and excludes Node 01 canaries from production health", () => {
  assert.match(compute, /usage\.startsWith\("node01-music-"\)/);
  assert.match(compute, /"music_separator", "music_vocal_correction"/);
  assert.match(compute, /LOCAL_GPU_DEMUCS_TORCHCREPE_FIRST/);
});
