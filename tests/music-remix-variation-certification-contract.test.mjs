import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const benchmark = await readFile("scripts/benchmark-avantiqo-music-transform.mjs", "utf8");
const remix = await readFile("scripts/benchmark-avantiqo-music-remix-variation.mjs", "utf8");
const launcher = await readFile("scripts/run-avantiqo-music-remix-variation-certification-local.mjs", "utf8");
const review = await readFile("scripts/review-latest-avantiqo-music-remix-variation-local.mjs", "utf8");

test("Music Remix uses an original dynamic-metal musical variation fixture", () => {
  assert.match(benchmark, /createAvantiqoMusicDynamicMetalContinuityFixtureWav/);
  assert.match(benchmark, /SOURCE_MODE_VARIATION = "MUSICAL_VARIATION"/);
  assert.match(benchmark, /external_reference_recording_used:false/);
  assert.match(benchmark, /imitate no artist or recording/);
  assert.match(benchmark, /audio_cover_strength:0\.6/);
});

test("Music Remix wrapper and launcher route only to canonical Modal benchmark", () => {
  for (const source of [remix, launcher]) {
    assert.match(source, /AVANTIQO_MUSIC_TRANSFORM_CAPABILITY = "ai\.audio\.remix"/);
    assert.match(source, /AVANTIQO_MUSIC_TRANSFORM_SOURCE_MODE = "MUSICAL_VARIATION"/);
    assert.match(source, /benchmark-avantiqo-music-transform\.mjs/);
    assert.doesNotMatch(source, /RUNPOD|SAFE_LEASE|candidate-v1/i);
  }
});

test("Music Remix requires human musical review before later release", () => {
  assert.match(review, /MUSICAL_VARIATION/);
  assert.match(review, /remix_variation_technical_proven/);
  assert.match(review, /MODAL_DIRECT_A10G_ASYNC_V1/);
  assert.match(review, /human_review_status/);
  assert.match(review, /APPROVED/);
  assert.match(review, /REJECTED/);
  assert.match(review, /eligible_for_later_release_decision/);
  assert.match(review, /production_activation_allowed:\s*false/);
  assert.match(review, /provider_jobs_submitted:\s*0/);
  assert.doesNotMatch(review, /SAFE_LEASE_LANE|safe_lease_lane/);
});
