import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const readiness = read("scripts/audit-avantiqo-music-separator-certification-readiness.mjs");
const benchmark = read("scripts/benchmark-avantiqo-music-separator.mjs");
const benchmarkLocal = read("scripts/run-avantiqo-music-separator-benchmark-local.mjs");
const oneShot = read("scripts/run-avantiqo-music-separator-certification-local.sh");
const provider = read("lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoMusicSeparatorModalProvider.js");
const modal = read("services/avantiqo-music-separator-engine/modal_app.py");
const economics = read("scripts/avantiqo-music-separator-economics.mjs");
const prepareReview = read("scripts/prepare-avantiqo-music-separator-human-review.mjs");
const finalizeReview = read("scripts/finalize-avantiqo-music-separator-human-review.mjs");
const promotionPlan = read("scripts/plan-avantiqo-music-separator-promotion.mjs");
const engine = read("lib/creative/runtime/engines/MusicEngine.js");

test("separator certification chain is Modal-direct, approval-gated, and fail closed", () => {
  assert.match(readiness, /AVANTIQO_MUSIC_SEPARATOR_CERTIFICATION_READINESS_V2/);
  assert.match(readiness, /MODAL_DIRECT_A10G_ASYNC_V1/);
  assert.match(benchmark, /AVANTIQO_MUSIC_SEPARATOR_BENCHMARK_SPEND_APPROVED/);
  assert.match(benchmark, /AVANTIQO_MUSIC_SEPARATOR_BENCHMARK_RIGHTS_APPROVED/);
  assert.match(benchmark, /ModalClient/);
  assert.match(benchmark, /avantiqo-music-separator-owned/);
  assert.match(benchmark, /functions\.fromName\(APP_NAME, FUNCTION_NAME/);
  assert.match(benchmark, /provider_job_count:\s*1/);
  assert.match(benchmark, /pricing_activation_performed:\s*false/);
  assert.match(benchmark, /production_deploy_performed:\s*false/);
  assert.doesNotMatch(benchmark, /RUNPOD|SAFE_LEASE|rest\.runpod\.io/i);
});

test("separator provider and worker remain certification-gated Modal execution", () => {
  assert.match(provider, /AVANTIQO_MUSIC_SEPARATOR_ENGINE_CERTIFIED/);
  assert.match(provider, /APP_NAME = "avantiqo-music-separator-owned"/);
  assert.match(provider, /FUNCTION_NAME = "separate"/);
  assert.match(provider, /createSignedUploadUrl/);
  assert.match(provider, /MODAL_DIRECT_ASYNC_V1/);
  assert.match(modal, /gpu=GPU/);
  assert.match(modal, /max_containers=1/);
  assert.match(modal, /runpod_inference_performed.*False/);
});

test("local separator certification runs benchmark then economics then human review without activating production", () => {
  assert.match(benchmarkLocal, /benchmark-avantiqo-music-separator\.mjs/);
  assert.match(oneShot, /audit-avantiqo-music-separator-certification-readiness\.mjs/);
  assert.match(oneShot, /run-avantiqo-music-separator-benchmark-local\.mjs/);
  assert.match(oneShot, /avantiqo-music-separator-economics\.mjs/);
  assert.match(oneShot, /prepare-avantiqo-music-separator-human-review\.mjs/);
  assert.match(oneShot, /PRODUCTION_ACTIVATION=false/);
  assert.doesNotMatch(oneShot, /runpod|safe.lease|workersMax|workersMin/i);
});

test("separator evidence requires human quality before promotion", () => {
  assert.match(economics, /SEPARATOR_HUMAN_QUALITY_REVIEW_REQUIRED/);
  assert.match(prepareReview, /automatic_human_approval_forbidden:\s*true/);
  assert.match(prepareReview, /minimum_average_score:\s*92/);
  assert.match(finalizeReview, /production_certified:\s*false/);
  assert.match(finalizeReview, /production_routing_allowed:\s*false/);
  assert.match(promotionPlan, /mode:\s*"PLAN_ONLY"/);
  assert.match(promotionPlan, /EXPLICIT_OPERATOR_PROMOTION_APPROVAL_REQUIRED/);
});

test("separator certification is bound to the Demucs four-stem baseline", () => {
  for (const source of [readiness, benchmark, economics, prepareReview, finalizeReview, promotionPlan]) {
    assert.match(source, /ai\.audio\.stems/);
    assert.match(source, /demucs-htdemucs-ft/);
    assert.match(source, /DEMUCS_HTDEMUCS_FT_4STEM_V1/);
  }
  assert.match(benchmark, /\["vocals", "drums", "bass", "other"\]/);
  assert.match(benchmark, /\["drums", "bass", "other"\]/);
});

test("stems and backing-track execution stay closed until certification", () => {
  assert.match(engine, /stems:\s*Object\.freeze\([\s\S]*?implementation:\s*"IMPLEMENTED"[\s\S]*?certification:\s*"BENCHMARK_AND_HUMAN_REVIEW_REQUIRED"/);
  assert.match(engine, /backing_track:\s*Object\.freeze\([\s\S]*?implementation:\s*"IMPLEMENTED"[\s\S]*?certification:\s*"BENCHMARK_AND_HUMAN_REVIEW_REQUIRED"/);
  assert.match(engine, /resolvedCertification\(contract\)/);
  assert.match(engine, /return runtimeReady \? "CERTIFIED" : contract\.certification/);
});
