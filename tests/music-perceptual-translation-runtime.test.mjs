import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const translationSource = fs.readFileSync(
  "lib/creative/music/runtime/CreativeMusicPerceptualTranslationRuntime.js",
  "utf8",
);
const finishingSource = fs.readFileSync(
  "lib/creative/music/runtime/CreativeMusicFinishingRuntime.js",
  "utf8",
);
const executionSource = fs.readFileSync(
  "lib/creative/music/runtime/CreativeMusicWorldClassExecutionRuntime.js",
  "utf8",
);
const dailiesSource = fs.readFileSync(
  "lib/creative/music/runtime/CreativeMusicDailiesListeningRuntime.js",
  "utf8",
);

test("perceptual translation runtime measures real master signal evidence", () => {
  assert.match(translationSource, /AVANTIQO_MUSIC_PERCEPTUAL_TRANSLATION_V1/);
  assert.match(translationSource, /stereo_correlation/);
  assert.match(translationSource, /mono_fold_down_loss_db/);
  assert.match(translationSource, /crest_factor_db/);
  assert.match(translationSource, /low_end_vs_body_db/);
  assert.match(translationSource, /harshness_vs_body_db/);
});

test("lossy delivery translation is measured after decode", () => {
  assert.match(translationSource, /deliveryDrift/);
  assert.match(translationSource, /measured_from_decoded_delivery:\s*true/);
  assert.match(translationSource, /codec_translation/);
});

test("perceptual translation remains advisory and non-mutating", () => {
  assert.match(translationSource, /artistic_intent_inferred:\s*false/);
  assert.match(translationSource, /mutation_authorized:\s*false/);
  assert.match(translationSource, /publication_authorized:\s*false/);
});

test("each destination master persists measured translation evidence", () => {
  assert.match(finishingSource, /analyzeMusicPerceptualTranslation/);
  assert.match(finishingSource, /music_perceptual_translation:/);
  assert.match(finishingSource, /summarizeMusicPerceptualTranslation/);
  assert.match(finishingSource, /perceptual_translation_passed:/);
});

test("Dailies has an independent translation reviewer grounded in measured evidence", () => {
  assert.match(dailiesSource, /\["TRANSLATION"/);
  assert.match(dailiesSource, /perceptual_translation:\s*translation_qc/);
  assert.match(dailiesSource, /music_perceptual_translation_summary/);
});

test("world-class release requires perceptual translation pass", () => {
  assert.match(executionSource, /perceptual_translation_passed/);
  assert.match(executionSource, /PERCEPTUAL_TRANSLATION_REVIEW_REQUIRED/);
  assert.match(executionSource, /finalTribunal\?\.release_ready === true && finalFinishing\?\.destination_qc_passed === true && finalFinishing\?\.perceptual_translation_passed === true && finalFinishing\?\.master_set_lineage_current === true/);
});
