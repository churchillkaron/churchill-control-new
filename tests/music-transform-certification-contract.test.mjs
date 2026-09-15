import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const benchmark = await readFile("scripts/benchmark-avantiqo-music-transform.mjs", "utf8");
const review = await readFile("scripts/review-avantiqo-music-transform-certification-local.mjs", "utf8");
const record = await readFile("scripts/record-avantiqo-music-transform-human-review-local.mjs", "utf8");
const modal = await readFile("services/avantiqo-audio-modal/modal_app.py", "utf8");

test("Music transform certification is one-job Modal-direct and explicitly approved", () => {
  assert.match(benchmark, /AVANTIQO_AUDIO_BENCHMARK_SPEND_APPROVED/);
  assert.match(benchmark, /AVANTIQO_MUSIC_TRANSFORM_SOURCE_RIGHTS_APPROVED/);
  assert.match(benchmark, /APP_NAME = "avantiqo-audio-owned"/);
  assert.match(benchmark, /FUNCTION_NAME = "generate"/);
  assert.match(benchmark, /worker\.spawn\(\[payload\]\)/);
  assert.match(benchmark, /max_provider_jobs:1/);
  assert.match(benchmark, /benchmark_runs:1/);
  assert.match(benchmark, /production_activation_allowed:false/);
  assert.match(benchmark, /pricing_activation_allowed:false/);
  assert.match(benchmark, /provider_selection_change_allowed:false/);
  assert.match(benchmark, /provider_jobs_submitted:1/);
  assert.doesNotMatch(benchmark, /RUNPOD|SAFE_LEASE|api\.runpod\.ai/i);
});

test("Music Extend benchmark proves a genuinely longer Modal output", () => {
  assert.match(benchmark, /"ai\.audio\.extend"/);
  assert.match(benchmark, /EXTEND_SECONDS = 8/);
  assert.match(benchmark, /EXTEND_OVERLAP_SECONDS = 3/);
  assert.match(benchmark, /XL_TURBO_REPAINT_RIGHT_OUTPAINT/);
  assert.match(benchmark, /Number\(output\?\.duration_seconds\)>Number\(output\?\.source_duration_seconds\)\+1/);
  assert.match(benchmark, /temporal_extension_observed===true/);
});

test("Music transform human review accepts only Modal benchmark evidence and never activates production", () => {
  for (const source of [review, record]) {
    assert.match(source, /AVANTIQO_MUSIC_TRANSFORM_CERTIFICATION_BENCHMARK_V3/);
    assert.match(source, /MODAL_DIRECT_A10G_ASYNC_V1/);
    assert.match(source, /human_review_required/);
    assert.match(source, /production_activation_allowed/);
    assert.match(source, /pricing_activation_allowed/);
    assert.match(source, /provider_selection_change_allowed/);
    assert.doesNotMatch(source, /SAFE_LEASE_LANE|safe_lease_lane/);
  }
});

test("Owned Audio Modal worker implements all transform capabilities", () => {
  assert.match(modal, /ai\.audio\.remix/);
  assert.match(modal, /ai\.audio\.edit/);
  assert.match(modal, /ai\.audio\.extend/);
});
