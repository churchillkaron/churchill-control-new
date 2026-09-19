import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const files = Object.freeze({
  handler: "services/avantiqo-music-vocal-correction-engine/handler.py",
  requirements: "services/avantiqo-music-vocal-correction-engine/requirements.txt",
  dockerfile: "services/avantiqo-music-vocal-correction-engine/Dockerfile",
  provider: "lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoMusicVocalCorrectionModalProvider.js",
});

async function source(path) {
  return readFile(path, "utf8");
}

function hasAll(content, markers) {
  for (const marker of markers) {
    assert.ok(content.includes(marker), `missing marker: ${marker}`);
  }
}

test("Music vocal correction worker is isolated-vocal, rights-gated and uncertified by default", async () => {
  const handler = await source(files.handler);
  hasAll(handler, [
    "AVANTIQO_MUSIC_VOCAL_CORRECTION_ENGINE_V1",
    'CAPABILITY = "ai.audio.vocal-correct"',
    'MODEL = "torchcrepe-full"',
    "TORCHCREPE_SIGNALSMITH_VOCAL_CORRECTION_V1",
    "AVANTIQO_SOURCE_AUDIO_RIGHTS_ATTESTATION_V1",
    "USER_RIGHTS_ATTESTATION_ONLY",
    "AVANTIQO_MUSIC_VOCAL_CORRECTION_ISOLATED_VOCAL_REQUIRED",
    "mixed_program_pitch_correction_forbidden",
    "production_certified\": False",
    "human_listening_review_required_for_certification",
  ]);
});

test("Music vocal correction uses pinned MIT-compatible pitch/stretch stack", async () => {
  const [requirements, dockerfile] = await Promise.all([
    source(files.requirements),
    source(files.dockerfile),
  ]);
  hasAll(requirements, [
    "torchcrepe==0.0.24",
    "python-stretch==0.3.1",
    "librosa==0.11.0",
    "soundfile==0.13.1",
  ]);
  hasAll(dockerfile, [
    "nvidia/cuda:12.8.1-cudnn-runtime-ubuntu22.04",
    "torch==2.7.1",
    "torchaudio==2.7.1",
    "AVANTIQO_MUSIC_VOCAL_CORRECTION_DEPENDENCY_SMOKE=PASS",
    'CMD ["python3", "/app/handler_v2.py"]',
  ]);
});

test("Music vocal correction provider is Modal-direct and fails closed until certified", async () => {
  const provider = await source(files.provider);
  hasAll(provider, [
    'transportMode: "direct-sdk"',
    'appName: "avantiqo-music-vocal-correction-owned"',
    'functionName: "correct"',
    "AVANTIQO_MUSIC_VOCAL_CORRECTION_ENGINE_NOT_CERTIFIED",
    'corrected_vocal_wav: "wav"',
    'correction_report_json: "json"',
  ]);
  assert.equal(/RUNPOD|SAFE_LEASE|rest\.runpod\.io/.test(provider), false);
});

test("worker performs restrained pitch correction and only analyzes timing until phrase warp is certified", async () => {
  const handler = await source(files.handler);
  hasAll(handler, [
    "torchcrepe.predict",
    "torchcrepe.decode.viterbi",
    "Signalsmith.Stretch",
    "setTransposeSemitones",
    "NOTE_SEGMENT_CONSTANT_SHIFT_WITH_CROSSFADE",
    "preserve_vibrato",
    "ANALYZED_REFERENCE_GRID",
    "phrase_warp_engine_required",
    '"phrase_timing_warp_complete": False',
  ]);
});
