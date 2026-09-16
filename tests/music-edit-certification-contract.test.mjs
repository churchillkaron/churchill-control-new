import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const benchmark = await readFile("scripts/benchmark-avantiqo-music-transform.mjs", "utf8");
const review = await readFile("scripts/review-avantiqo-music-edit-certification-local.mjs", "utf8");
const record = await readFile("scripts/record-avantiqo-music-edit-human-review-local.mjs", "utf8");
test("Music Edit has an original musical review source and exact source evidence", () => {
  assert.match(benchmark, /SOURCE_MODE_EDIT = "MUSICAL_EDIT"/);
  assert.match(benchmark, /MUSICAL_SURGICAL_EDIT/);
  assert.match(benchmark, /source_storage_reference:sourceReference/);
  assert.match(benchmark, /AVANTIQO_MUSIC_MUSICAL_EDIT_REQUIRES_EDIT/);
});
test("Music Edit review proves selected-region change and outside preservation", () => {
  assert.match(review, /pre\.correlation >= 0\.995/);
  assert.match(review, /post\.correlation >= 0\.995/);
  assert.match(review, /edited\.correlation <= 0\.95/);
  assert.match(review, /AVANTIQO_MUSIC_EDIT_SURGICAL_INTEGRITY_FAILED/);
  assert.match(review, /automatic_human_approval_forbidden: true/);
  assert.match(review, /minimum_average_score: 92/);
});
test("Music Edit review result never auto-activates production", () => {
  assert.match(record, /APPROVED/);
  assert.match(record, /REJECTED/);
  assert.match(record, /production_certified: false/);
  assert.match(record, /production_activation_allowed: false/);
  assert.match(record, /pricing_activation_allowed: false/);
  assert.match(record, /provider_jobs_submitted: 0/);
});
