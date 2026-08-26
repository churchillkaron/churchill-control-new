import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  buildMusicTransformationPlan,
  MUSIC_SOURCE_AUDIO_MAX_SECONDS,
  MUSIC_SOURCE_AUDIO_RIGHTS_ATTESTATION_CONTRACT,
  MUSIC_STEM_SEPARATOR_LANE,
  MUSIC_STEM_SEPARATOR_PROFILE,
} from "../lib/creative/runtime/engines/MusicEngine.js";

const separatorProvider = fs.readFileSync(
  new URL(
    "../lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoMusicSeparatorProvider.js",
    import.meta.url,
  ),
  "utf8",
);
const audioProvider = fs.readFileSync(
  new URL(
    "../lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoAudioProvider.js",
    import.meta.url,
  ),
  "utf8",
);
const separatorWorker = fs.readFileSync(
  new URL("../services/avantiqo-music-separator-engine/handler.py", import.meta.url),
  "utf8",
);
const separatorDockerfile = fs.readFileSync(
  new URL("../services/avantiqo-music-separator-engine/Dockerfile", import.meta.url),
  "utf8",
);

const source = "storage://creative-assets/example/original-song.wav";
const rights = {
  contract: MUSIC_SOURCE_AUDIO_RIGHTS_ATTESTATION_CONTRACT,
  confirmed: true,
};

test("backing track requires explicit source-audio rights confirmation", () => {
  assert.throws(
    () => buildMusicTransformationPlan("backing_track", { source_audio: source }),
    /CREATIVE_MUSIC_SOURCE_RIGHTS_CONFIRMATION_REQUIRED/,
  );

  const plan = buildMusicTransformationPlan("backing_track", {
    source_audio: source,
    source_duration_seconds: 420,
    rights_attestation: rights,
  });
  assert.equal(plan.rights_attestation.confirmed, true);
  assert.equal(plan.rights_attestation.contract, MUSIC_SOURCE_AUDIO_RIGHTS_ATTESTATION_CONTRACT);
  assert.equal(plan.content_restriction_policy, "USER_RIGHTS_ATTESTATION_ONLY");
});

test("backing track has a full-song lane independent of 3 minute composition", () => {
  assert.equal(MUSIC_SOURCE_AUDIO_MAX_SECONDS, 900);
  const plan = buildMusicTransformationPlan("backing_track", {
    source_audio: source,
    source_duration_seconds: 600,
    rights_attestation: rights,
  });
  assert.equal(plan.session.source_duration_seconds, 600);
  assert.equal(plan.output_spec.max_source_duration_seconds, 900);

  assert.throws(
    () => buildMusicTransformationPlan("backing_track", {
      source_audio: source,
      source_duration_seconds: 901,
      rights_attestation: rights,
    }),
    /CREATIVE_MUSIC_SOURCE_DURATION_INVALID/,
  );
});

test("backing track uses dedicated four-stem separation and remains certification gated", () => {
  const plan = buildMusicTransformationPlan("backing_track", {
    source_audio: source,
    source_duration_seconds: 240,
    rights_attestation: rights,
  });
  assert.equal(plan.capability, "ai.audio.stems");
  assert.equal(plan.model_lane, MUSIC_STEM_SEPARATOR_LANE);
  assert.equal(plan.quality_profile, MUSIC_STEM_SEPARATOR_PROFILE);
  assert.deepEqual(plan.separation.stems, ["vocals", "drums", "bass", "other"]);
  assert.deepEqual(plan.separation.backing_stems, ["drums", "bass", "other"]);
  assert.equal(plan.provider_parameters.remove_vocals, true);
  assert.equal(plan.executable, false);
  assert.equal(plan.certification, "BENCHMARK_AND_HUMAN_REVIEW_REQUIRED");
});

test("backing track normalization supports performance controls", () => {
  const plan = buildMusicTransformationPlan("backing_track", {
    source_audio: source,
    source_duration_seconds: 300,
    rights_attestation: rights,
    key_shift_semitones: -2,
    tempo_ratio: 0.95,
    count_in_bars: 2,
    preserve_arrangement: true,
    export_stems: true,
  });
  assert.equal(plan.provider_parameters.key_shift_semitones, -2);
  assert.equal(plan.provider_parameters.tempo_ratio, 0.95);
  assert.equal(plan.provider_parameters.count_in_bars, 2);
  assert.equal(plan.provider_parameters.preserve_arrangement, true);
  assert.equal(plan.provider_parameters.export_stems, true);
  assert.deepEqual(plan.output_spec.deliveries, [
    "backing_track_wav",
    "backing_track_mp3",
    "stems_wav",
  ]);
});

test("separator transport is isolated from the certified generation endpoint", () => {
  assert.match(audioProvider, /isSeparatorCapability/);
  assert.match(audioProvider, /AVANTIQO_MUSIC_SEPARATOR_JOB_PREFIX/);
  assert.match(separatorProvider, /RUNPOD_AVANTIQO_MUSIC_SEPARATOR_ENDPOINT_ID/);
  assert.match(separatorProvider, /AVANTIQO_MUSIC_SEPARATOR_ENGINE_ENABLED/);
  assert.match(separatorProvider, /output_uploads/);
  assert.match(separatorProvider, /backing-track\.wav/);
  assert.match(separatorProvider, /vocals\.wav/);
  assert.match(separatorProvider, /drums\.wav/);
  assert.match(separatorProvider, /bass\.wav/);
  assert.match(separatorProvider, /other\.wav/);
});

test("separator worker enforces rights, duration and immutable Demucs model contract", () => {
  assert.match(separatorWorker, /AVANTIQO_MUSIC_SEPARATOR_ENGINE_V1/);
  assert.match(separatorWorker, /AVANTIQO_SOURCE_AUDIO_RIGHTS_ATTESTATION_V1/);
  assert.match(separatorWorker, /USER_RIGHTS_ATTESTATION_ONLY/);
  assert.match(separatorWorker, /htdemucs_ft/);
  assert.match(separatorWorker, /MAX_SOURCE_DURATION_SECONDS/);
  assert.match(separatorWorker, /SOURCE_TOO_LONG/);
  assert.match(separatorWorker, /BACKING_STEMS = \("drums", "bass", "other"\)/);
  assert.match(separatorDockerfile, /TORCH_HOME=\/opt\/avantiqo-demucs-cache/);
  assert.match(separatorDockerfile, /get_model\("htdemucs_ft"\)/);
  assert.doesNotMatch(separatorDockerfile, /runpod-volume/);
});