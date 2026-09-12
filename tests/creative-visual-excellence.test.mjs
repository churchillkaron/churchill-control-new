import test from "node:test";
import assert from "node:assert/strict";
import { evaluateVisualExcellence } from "../lib/creative/quality/runtime/CreativeVisualExcellenceRuntime.js";

function dna(hero = false) { return { contract: "CREATIVE_SHOT_CINEMATIC_DNA_V1", visual_quality_floor: 94, iconic_frame: { required: hero } }; }
function evidence(score = 97) { return { composition_score:score, depth_score:score, lighting_quality_score:score, material_realism_score:score, production_design_score:score, visual_hierarchy_score:score, place_specificity_score:score, scale_readability_score:score, iconic_frame_score:score }; }

test("visual excellence uses weakest critical dimension as veto", () => {
  const e = evidence(98); e.material_realism_score = 91;
  const r = evaluateVisualExcellence({ cinematic_dna:dna(false), evidence:e, media_kind:"VIDEO" });
  assert.equal(r.passed, false); assert.match(r.failures.join(" "), /material_realism/); assert.equal(r.weakest_score, 91);
});

test("hero shots require stronger iconic frame score", () => {
  const e = evidence(97); e.iconic_frame_score = 95;
  const r = evaluateVisualExcellence({ cinematic_dna:dna(true), evidence:e, media_kind:"VIDEO" });
  assert.equal(r.passed, false); assert.match(r.failures.join(" "), /ICONIC_FRAME/);
});

test("elite visual shot passes when all critical dimensions clear floor", () => {
  const r = evaluateVisualExcellence({ cinematic_dna:dna(true), evidence:evidence(98), media_kind:"VIDEO" });
  assert.equal(r.passed, true); assert.equal(r.weakest_score, 98);
});
