import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const review = await readFile("scripts/review-latest-avantiqo-music-remix-variation-local.mjs", "utf8");
test("Music Remix review includes source and remix evidence", () => {
  assert.match(review, /source_storage_reference/);
  assert.match(review, /source\.wav/);
  assert.match(review, /remix-output\.wav/);
  assert.match(review, /waveformMetrics/);
  assert.match(review, /recognizable_identity_floor_passed/);
  assert.match(review, /alternate_arrangement_passed/);
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
