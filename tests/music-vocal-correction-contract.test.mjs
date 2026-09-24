import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const handler = fs.readFileSync("services/avantiqo-music-vocal-correction-engine/handler.py", "utf8");
const requirements = fs.readFileSync("services/avantiqo-music-vocal-correction-engine/requirements.txt", "utf8");
const docker = fs.readFileSync("services/avantiqo-music-vocal-correction-engine/Dockerfile", "utf8");
const provider = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoMusicVocalCorrectionLocalQueueProvider.js", "utf8");

test("Music vocal correction worker is isolated-vocal, rights-gated and uncertified by default", () => {
  assert.match(handler, /AVANTIQO_MUSIC_VOCAL_CORRECTION_ENGINE_V1/);
  assert.match(handler, /CAPABILITY = "ai\.audio\.vocal-correct"/);
  assert.match(handler, /MODEL = "torchcrepe-full"/);
  assert.match(handler, /AVANTIQO_SOURCE_AUDIO_RIGHTS_ATTESTATION_V1/);
  assert.match(handler, /USER_RIGHTS_ATTESTATION_ONLY/);
  assert.match(handler, /mixed_program_pitch_correction_forbidden/);
});

test("Music vocal correction keeps the pinned pitch and stretch stack", () => {
  assert.match(requirements, /torchcrepe==0\.0\.24/);
  assert.match(requirements, /python-stretch==0\.3\.1/);
  assert.match(docker, /CMD \["python3", "\/app\/handler_v2\.py"\]/);
});

test("Music vocal correction production provider is local and fails closed until certified", () => {
  assert.match(provider, /AVANTIQO_MUSIC_VOCAL_CORRECTION_ENGINE_CERTIFIED/);
  assert.match(provider, /AVANTIQO_MUSIC_VOCAL_CORRECTION_ENGINE_NOT_CERTIFIED/);
  assert.match(provider, /MODEL="torchcrepe-full"/);
  assert.match(provider, /lane:"gpu"/);
  assert.match(provider, /corrected_vocal_wav:"wav"/);
  assert.match(provider, /correction_report_json:"json"/);
  assert.doesNotMatch(provider, /RunPod|Modal|SAFE_LEASE/);
});

test("worker performs restrained pitch correction and preserves human review boundaries", () => {
  assert.match(handler, /torchcrepe\.predict/);
  assert.match(handler, /Signalsmith\.Stretch/);
  assert.match(handler, /preserve_vibrato/);
  assert.match(handler, /human_listening_review_required_for_certification/);
});
