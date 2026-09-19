import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const shared = await readFile("lib/platform/service-runtime/providers/avantiqo-owned/AvantiqoOwnedModalWorker.js", "utf8");
const provider = await readFile("lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoMusicVocalCorrectionModalProvider.js", "utf8");
const audio = await readFile("lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoAudioProvider.js", "utf8");
const registration = await readFile("lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoAudioProviderRegistration.js", "utf8");
const modal = await readFile("services/avantiqo-music-vocal-correction-modal/modal_app.py", "utf8");

test("shared Modal transport supports named multi-output upload targets", () => {
  assert.match(shared, /outputTargets = null/);
  assert.match(shared, /output_uploads: outputUploads/);
  assert.match(shared, /storage_references/);
  assert.match(shared, /variant = null/);
});

test("vocal correction has a Modal-direct certification-gated runtime", () => {
  assert.match(provider, /transportMode: "direct-sdk"/);
  assert.match(provider, /AVANTIQO_MUSIC_VOCAL_CORRECTION_ENGINE_CERTIFIED/);
  assert.match(provider, /corrected_vocal_wav: "wav"/);
  assert.match(provider, /correction_report_json: "json"/);
  assert.match(audio, /AvantiqoMusicVocalCorrectionModalProvider\.execute/);
  assert.match(audio, /AVANTIQO_MUSIC_VOCAL_CORRECTION_MODAL_JOB_PREFIX/);
  assert.match(registration, /vocalCorrectionRuntimeAvailable = Boolean\(engineEnabled && modalConfigured && vocalCorrectionEngineEnabled && vocalCorrectionEngineCertified\)/);
});

test("vocal correction Modal wrapper binds reviewed plans to the immutable V2 worker", () => {
  assert.match(modal, /sha256:112dae577e5d8f756203ac42f17887b374ce210cae9a872dbe283ae7d143f046/);
  assert.match(modal, /handler_v2/);
  assert.match(modal, /TORCHCREPE_SIGNALSMITH_VOCAL_CORRECTION_V2/);
  assert.match(modal, /corrected_vocal/);
  assert.match(modal, /correction_report/);
  assert.match(modal, /raw_reasoning_persisted.*False/);
});
