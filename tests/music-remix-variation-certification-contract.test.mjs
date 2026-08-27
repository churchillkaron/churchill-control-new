import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const benchmark = await readFile("scripts/benchmark-avantiqo-music-remix-variation.mjs", "utf8");
const launcher = await readFile("scripts/run-avantiqo-music-remix-variation-certification-local.mjs", "utf8");
const review = await readFile("scripts/review-latest-avantiqo-music-remix-variation-local.mjs", "utf8");

test("Music Remix variation certification uses an original musical source and one candidate job", () => {
  assert.match(benchmark, /createAvantiqoMusicDynamicMetalContinuityFixtureWav/);
  assert.match(benchmark, /original_composition/);
  assert.match(benchmark, /royalty_free/);
  assert.match(benchmark, /external_reference_recording_used:\s*false/);
  assert.match(benchmark, /artist_imitation_requested:\s*false/);
  assert.match(benchmark, /EXPECTED_CAPABILITY = "ai\.audio\.remix"/);
  assert.match(benchmark, /EXPECTED_TASK_TYPE = "cover"/);
  assert.match(benchmark, /EXPECTED_COVER_STRENGTH = 0\.6/);
  assert.match(benchmark, /max_provider_jobs !== 1/);
  assert.match(benchmark, /benchmark_runs !== 1/);
  assert.match(benchmark, /MUSICAL_VARIATION/);
});

test("Music Remix source replacement intercepts only the direct storage object upload", () => {
  assert.match(benchmark, /isDirectStorageObjectPath/);
  assert.match(benchmark, /!pathname\.includes\("\/storage\/v1\/object\/sign\/"\)/);
  assert.match(benchmark, /!pathname\.includes\("\/storage\/v1\/object\/upload\/sign\/"\)/);
  assert.match(benchmark, /method === "POST"/);
  assert.match(benchmark, /-source\\\.wav\$\/i/);
});

test("Music Remix variation launcher stays isolated from production Audio", () => {
  assert.match(launcher, /avantiqo-music-transform-candidate-v1/);
  assert.match(launcher, /music-transform-candidate/);
  assert.match(launcher, /PRODUCTION_AUDIO_ENDPOINT_NAME = "avantiqo-audio-v1"/);
  assert.match(launcher, /CANDIDATE_PRODUCTION_AUDIO_COLLISION/);
  assert.match(launcher, /AVANTIQO_MUSIC_REMIX_VARIATION_MAX_PROVIDER_JOBS=1/);
  assert.match(launcher, /AVANTIQO_MUSIC_REMIX_VARIATION_PRODUCTION_ACTIVATION=false/);
  assert.match(launcher, /AVANTIQO_MUSIC_REMIX_VARIATION_PRICING_ACTIVATION=false/);
  assert.match(launcher, /AVANTIQO_MUSIC_REMIX_VARIATION_PROVIDER_SELECTION_CHANGE=false/);
  assert.match(launcher, /preflight-avantiqo-music-transform-candidate-local\.mjs/);
  assert.match(launcher, /run-avantiqo-runpod-safe-lease-v2-local\.mjs/);
});

test("Music Remix variation requires human musical review before later release", () => {
  assert.match(review, /MUSICAL_VARIATION/);
  assert.match(review, /remix_variation_technical_proven/);
  assert.match(review, /human_review_status/);
  assert.match(review, /APPROVED/);
  assert.match(review, /REJECTED/);
  assert.match(review, /eligible_for_later_release_decision/);
  assert.match(review, /production_activation_allowed:\s*false/);
  assert.match(review, /provider_jobs_submitted:\s*0/);
  assert.match(review, /runpod_lease_opened:\s*false/);
});
