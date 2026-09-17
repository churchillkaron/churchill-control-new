import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const vocal = readFileSync("lib/creative/music/runtime/CreativeMusicProfessionalVocalProductionRuntime.js", "utf8");
const continuation = readFileSync("lib/creative/music/runtime/CreativeMusicProfessionalContinuationRuntime.js", "utf8");

test("professional vocal preparation is local-first and preserves the original stem", () => {
  assert.match(vocal, /processMusicVocalEngineeringLocal/);
  assert.match(vocal, /analyzeMusicVocalPitch/);
  assert.match(vocal, /analyzeMusicVocalTiming/);
  assert.match(vocal, /previous_sources/);
  assert.match(vocal, /parent_source_preserved:true/);
  assert.match(vocal, /destructive_edit:false/);
});

test("professional vocal preparation builds review plans and does not auto certify", () => {
  assert.match(vocal, /buildMusicVocalTuningPlan/);
  assert.match(vocal, /buildMusicVocalTimingPlan/);
  assert.match(vocal, /status:"REVIEW_REQUIRED"/);
  assert.match(vocal, /professional_vocal_production_passed:false/);
  assert.match(vocal, /human_listening_review_required:true/);
});

test("professional vocal certification requires corrected render evidence and human approval", () => {
  assert.match(vocal, /human_listening_review_approved!==true/);
  assert.match(vocal, /vocal_tuning_render_contract/);
  assert.match(vocal, /professional_vocal_production_passed:true/);
});

test("professional continuation stops at review after vocal preparation", () => {
  assert.match(continuation, /next\.stage_id==="VOCAL_PRODUCTION"/);
  assert.match(continuation, /prepareProfessionalVocalProduction/);
  assert.match(continuation, /status:"REVIEW_REQUIRED"/);
});
