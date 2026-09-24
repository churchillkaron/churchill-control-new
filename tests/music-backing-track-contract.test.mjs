import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildMusicTransformationPlan, MUSIC_SOURCE_AUDIO_MAX_SECONDS, MUSIC_SOURCE_AUDIO_RIGHTS_ATTESTATION_CONTRACT, MUSIC_STEM_SEPARATOR_LANE, MUSIC_STEM_SEPARATOR_PROFILE } from "../lib/creative/runtime/engines/MusicEngine.js";

const audioProvider = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoAudioProvider.js", "utf8");
const separatorProvider = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoMusicSeparatorLocalQueueProvider.js", "utf8");
const worker = fs.readFileSync("scripts/local-node/avantiqo-node01-worker.ps1", "utf8");
const source = "storage://creative-assets/example/original-song.wav";
const rights = { contract: MUSIC_SOURCE_AUDIO_RIGHTS_ATTESTATION_CONTRACT, confirmed: true };

test("backing track requires explicit source-audio rights confirmation", () => {
  assert.throws(() => buildMusicTransformationPlan("backing_track", { source_audio: source }), /CREATIVE_MUSIC_SOURCE_RIGHTS_CONFIRMATION_REQUIRED/);
  const plan = buildMusicTransformationPlan("backing_track", { source_audio: source, source_duration_seconds: 420, rights_attestation: rights });
  assert.equal(plan.rights_attestation.confirmed, true);
  assert.equal(plan.content_restriction_policy, "USER_RIGHTS_ATTESTATION_ONLY");
});

test("backing track supports full-song sources independently of generation duration", () => {
  assert.equal(MUSIC_SOURCE_AUDIO_MAX_SECONDS, 900);
  const plan = buildMusicTransformationPlan("backing_track", { source_audio: source, source_duration_seconds: 600, rights_attestation: rights });
  assert.equal(plan.session.source_duration_seconds, 600);
  assert.equal(plan.output_spec.max_source_duration_seconds, 900);
  assert.throws(() => buildMusicTransformationPlan("backing_track", { source_audio: source, source_duration_seconds: 901, rights_attestation: rights }), /CREATIVE_MUSIC_SOURCE_DURATION_INVALID/);
});

test("backing track uses the governed four-stem separator and stays certification gated by default", () => {
  const plan = buildMusicTransformationPlan("backing_track", { source_audio: source, source_duration_seconds: 240, rights_attestation: rights });
  assert.equal(plan.capability, "ai.audio.stems");
  assert.equal(plan.model_lane, MUSIC_STEM_SEPARATOR_LANE);
  assert.equal(plan.quality_profile, MUSIC_STEM_SEPARATOR_PROFILE);
  assert.deepEqual(plan.separation.stems, ["vocals", "drums", "bass", "other"]);
  assert.deepEqual(plan.separation.backing_stems, ["drums", "bass", "other"]);
  assert.equal(plan.executable, false);
});

test("backing track normalization preserves performance controls", () => {
  const plan = buildMusicTransformationPlan("backing_track", { source_audio: source, source_duration_seconds: 300, rights_attestation: rights, key_shift_semitones: -2, tempo_ratio: 0.95, count_in_bars: 2, preserve_arrangement: true, export_stems: true });
  assert.equal(plan.provider_parameters.key_shift_semitones, -2);
  assert.equal(plan.provider_parameters.tempo_ratio, 0.95);
  assert.equal(plan.provider_parameters.count_in_bars, 2);
  assert.deepEqual(plan.output_spec.deliveries, ["backing_track_wav", "backing_track_mp3", "stems_wav"]);
});

test("separator transport is isolated on the certified local GPU queue", () => {
  assert.match(audioProvider, /AvantiqoMusicSeparatorLocalQueueProvider/);
  assert.match(audioProvider, /AVANTIQO_MUSIC_SEPARATOR_LOCAL_NODE_UNAVAILABLE/);
  assert.match(separatorProvider, /AVANTIQO_MUSIC_SEPARATOR_ENGINE_CERTIFIED/);
  assert.match(separatorProvider, /const CAPABILITY = "ai\.audio\.stems"/);
  assert.match(separatorProvider, /const MODEL = "demucs-htdemucs-ft"/);
  assert.match(separatorProvider, /lane:"gpu"/);
  assert.match(worker, /RunMusicSeparatorJob/);
  assert.doesNotMatch(audioProvider, /AvantiqoMusicSeparatorModalProvider|RunPod/);
});
