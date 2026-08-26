import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const readiness = read("scripts/audit-avantiqo-music-separator-certification-readiness.mjs");
const benchmark = read("scripts/benchmark-avantiqo-music-separator.mjs");
const economics = read("scripts/avantiqo-music-separator-economics.mjs");
const prepareReview = read("scripts/prepare-avantiqo-music-separator-human-review.mjs");
const finalizeReview = read("scripts/finalize-avantiqo-music-separator-human-review.mjs");
const promotionPlan = read("scripts/plan-avantiqo-music-separator-promotion.mjs");
const engine = read("lib/creative/runtime/engines/MusicEngine.js");

test("Music separator certification remains a fail-closed explicit chain", () => {
  assert.match(readiness, /CONTROLLED_SEPARATOR_BENCHMARK_EVIDENCE_REQUIRED/);
  assert.match(benchmark, /AVANTIQO_MUSIC_SEPARATOR_BENCHMARK_SPEND_APPROVED/);
  assert.match(benchmark, /AVANTIQO_MUSIC_SEPARATOR_BENCHMARK_RIGHTS_APPROVED/);
  assert.match(benchmark, /provider_job_submitted:\s*true/);
  assert.match(benchmark, /pricing_activation_performed:\s*false/);
  assert.match(benchmark, /production_deploy_performed:\s*false/);
  assert.match(economics, /SEPARATOR_HUMAN_QUALITY_REVIEW_REQUIRED/);
  assert.match(economics, /pricing_activation_performed:\s*false/);
  assert.match(prepareReview, /automatic_human_approval_forbidden:\s*true/);
  assert.match(prepareReview, /minimum_average_score:\s*92/);
  assert.match(finalizeReview, /production_certified:\s*false/);
  assert.match(finalizeReview, /production_routing_allowed:\s*false/);
  assert.match(promotionPlan, /mode:\s*"PLAN_ONLY"/);
  assert.match(promotionPlan, /EXPLICIT_OPERATOR_PROMOTION_APPROVAL_REQUIRED/);
  assert.match(promotionPlan, /provider_certification_mutation_performed:\s*false/);
  assert.match(promotionPlan, /production_routing_mutation_performed:\s*false/);
});

test("Music separator certification is bound to Demucs htdemucs_ft only", () => {
  for (const source of [readiness, benchmark, economics, prepareReview, finalizeReview, promotionPlan]) {
    assert.match(source, /ai\.audio\.stems/);
    assert.match(source, /facebookresearch\/demucs:htdemucs_ft/);
    assert.match(source, /demucs-htdemucs-ft/);
    assert.match(source, /DEMUCS_HTDEMUCS_FT_4STEM_V1/);
  }
  assert.match(benchmark, /\["vocals", "drums", "bass", "other"\]/);
  assert.match(benchmark, /\["drums", "bass", "other"\]/);
});

test("Backing track and stems remain non-executable until certification is promoted", () => {
  assert.match(engine, /stems:\s*Object\.freeze\([\s\S]*?certification:\s*"SEPARATOR_RUNTIME_AND_BENCHMARK_REQUIRED"/);
  assert.match(engine, /backing_track:\s*Object\.freeze\([\s\S]*?certification:\s*"SEPARATOR_RUNTIME_AND_BENCHMARK_REQUIRED"/);
  assert.match(engine, /implementation === "IMPLEMENTED" && certification === "CERTIFIED"/);
});
