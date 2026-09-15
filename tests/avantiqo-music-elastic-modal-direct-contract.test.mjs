import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const provider = await readFile("lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoMusicElasticModalProvider.js", "utf8");
const audio = await readFile("lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoAudioProvider.js", "utf8");
const registration = await readFile("lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoAudioProviderRegistration.js", "utf8");
const modal = await readFile("services/avantiqo-music-elastic-modal/modal_app.py", "utf8");

test("Elastic audio has a Modal-direct certification-gated runtime", () => {
  assert.match(provider, /transportMode: "direct-sdk"/);
  assert.match(provider, /AVANTIQO_MUSIC_ELASTIC_ENGINE_CERTIFIED/);
  assert.match(provider, /avantiqo-music-elastic-owned/);
  assert.match(provider, /functionName: "render"/);
  assert.match(audio, /AvantiqoMusicElasticModalProvider\.execute/);
  assert.match(audio, /AVANTIQO_MUSIC_ELASTIC_MODAL_JOB_PREFIX/);
  assert.match(registration, /elasticAudioRuntimeAvailable = Boolean\(engineEnabled && modalConfigured && elasticAudioEngineEnabled && elasticAudioEngineCertified\)/);
});

test("Elastic Modal wrapper binds the approved plan to the immutable historical worker image", () => {
  assert.match(modal, /sha256:4afbc10bcc514fb79f370d207adfdb7febb0cd1d99225f89404390e0c5b4b05c/);
  assert.match(modal, /approved_warp_plan/);
  assert.match(modal, /source_file_checksum/);
  assert.match(modal, /storage_reference/);
  assert.match(modal, /raw_reasoning_persisted.*False/);
});
