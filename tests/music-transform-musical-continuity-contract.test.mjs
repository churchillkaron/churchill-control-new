import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const fixture = await readFile("scripts/avantiqo-music-continuity-fixture.mjs", "utf8");
const benchmark = await readFile("scripts/benchmark-avantiqo-music-transform.mjs", "utf8");
const reviewPrep = await readFile("scripts/review-avantiqo-music-transform-certification-local.mjs", "utf8");
const reviewRecorder = await readFile("scripts/record-avantiqo-music-transform-human-review-local.mjs", "utf8");

test("Music continuity fixture is an original structured musical passage", () => {
  assert.match(fixture, /AVANTIQO_MUSIC_CONTINUITY_FIXTURE_V1/);
  assert.match(fixture, /Cmaj7-Am7-Fmaj7-G7/);
  assert.match(fixture, /warm_chord_pad/);
  assert.match(fixture, /bass/);
  assert.match(fixture, /lead_melody/);
  assert.match(fixture, /kick/);
  assert.match(fixture, /closed_hat/);
  assert.match(fixture, /original_composition: true/);
  assert.match(fixture, /royalty_free: true/);
  assert.match(fixture, /G7_UNRESOLVED_FOR_CONTINUATION_TEST/);
});

test("Music continuity certification reuses the guarded one-job Extend benchmark", () => {
  assert.match(benchmark, /SOURCE_MODE_CONTINUITY = "MUSICAL_CONTINUITY"/);
  assert.match(benchmark, /createAvantiqoMusicContinuityFixtureWav/);
  assert.match(benchmark, /avantiqoMusicContinuityFixtureMetadata/);
  assert.match(benchmark, /MUSICAL_CONTINUITY_REQUIRES_EXTEND/);
  assert.match(benchmark, /max_provider_jobs: 1/);
  assert.match(benchmark, /benchmark_runs: 1/);
  assert.match(benchmark, /SAFE_LEASE_LANE = "music-transform-candidate"/);
  assert.match(benchmark, /production_activation_allowed: false/);
  assert.match(benchmark, /pricing_activation_allowed: false/);
  assert.match(benchmark, /provider_selection_change_allowed: false/);
  assert.match(benchmark, /automatic_human_review_approved: false/);
  assert.match(benchmark, /eligible_for_human_release_review: fixture\.eligibleForHumanReleaseReview && temporalExtensionTechnicalProven/);
});

test("Only musical continuity evidence can reach final human approval", () => {
  for (const source of [reviewPrep, reviewRecorder]) {
    assert.match(source, /human_review_kind\) !== "MUSICAL_CONTINUITY"/);
    assert.match(source, /source_mode\) !== "MUSICAL_CONTINUITY"/);
    assert.match(source, /eligible_for_human_release_review !== true/);
    assert.match(source, /AVANTIQO_MUSIC_CONTINUITY_FIXTURE_V1/);
    assert.match(source, /original_composition !== true/);
    assert.match(source, /royalty_free !== true/);
  }
});

test("Technical sine source remains separate and cannot become release-quality evidence", () => {
  assert.match(benchmark, /SOURCE_MODE_TECHNICAL = "TECHNICAL_SYNTHETIC"/);
  assert.match(benchmark, /makeTechnicalWav/);
  assert.match(benchmark, /musical_quality_review_eligible: false/);
  assert.match(benchmark, /eligibleForHumanReleaseReview: false/);
  assert.match(benchmark, /humanReviewKind: "TECHNICAL_ONLY"/);
});
