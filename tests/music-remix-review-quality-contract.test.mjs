import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const review = await readFile("scripts/review-latest-avantiqo-music-remix-variation-local.mjs", "utf8");
test("Music Remix review includes source and remix evidence", () => {
  assert.match(review, /source_storage_reference/);
  assert.match(review, /source\.wav/);
  assert.match(review, /remix-output\.wav/);
  assert.match(review, /waveformMetrics/);
  assert.match(review, /non_copy_variation_passed/);
  assert.match(review, /recognizable_identity_requires_human_review/);
  assert.match(review, /automatic_identity_inference_forbidden/);
});
test("Music Remix review requires scored human quality at 92 average", () => {
  assert.match(review, /minimum_average_score:\s*92/);
  assert.match(review, /automatic_human_approval_forbidden:\s*true/);
  assert.match(review, /REVIEW_SCORES_REQUIRED/);
  assert.match(review, /averageScore < 92/);
  assert.match(review, /commercial_music_studio_readiness/);
});
test("Music Remix review cannot activate production", () => {
  assert.match(review, /production_activation_allowed:\s*false/);
  assert.match(review, /pricing_activation_allowed:\s*false/);
  assert.match(review, /provider_selection_change_allowed:\s*false/);
});

test("Music Remix review can bind to one exact benchmark report", () => {
  assert.match(review, /arg\("--report="\)/);
  assert.match(review, /EXACT_REPORT_NOT_ELIGIBLE/);
});

test("Music Remix does not machine-approve musical identity", () => {
  assert.match(review, /machine_evidence_scope:"NON_COPY_VARIATION_ONLY"/);
  assert.match(review, /recognizable_source_identity_decision:"HUMAN_REVIEW_REQUIRED"/);
});
