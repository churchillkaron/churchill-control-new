import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const prep = await readFile("scripts/review-avantiqo-music-transform-certification-local.mjs", "utf8");
const record = await readFile("scripts/record-avantiqo-music-transform-human-review-local.mjs", "utf8");
test("Music Extend review includes source and output with technical continuity evidence", () => {
  assert.match(prep, /source_storage_reference/); assert.match(prep, /source\.wav/); assert.match(prep, /extended-output\.wav/);
  assert.match(prep, /prefix_preservation_correlation/); assert.match(prep, /extension_audio_present/); assert.match(prep, /automatic_musical_continuity_inference_forbidden/);
});
test("Music Extend review requires scored 92 average human continuity review", () => {
  assert.match(prep, /minimum_average_score:92/); assert.match(prep, /automatic_human_approval_forbidden:true/);
  assert.match(record, /REVIEW_SCORES_REQUIRED/); assert.match(record, /averageScore < 92/); assert.match(record, /criterion_scores/);
});
test("Music Extend review stays fail-closed for activation", () => {
  for (const source of [prep, record]) { assert.match(source, /production_activation_allowed:\s*false/); assert.match(source, /pricing_activation_allowed:\s*false/); assert.match(source, /provider_selection_change_allowed:\s*false/); }
});
