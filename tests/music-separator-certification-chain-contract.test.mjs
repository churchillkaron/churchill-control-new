import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const readiness = read("scripts/audit-avantiqo-music-separator-certification-readiness.mjs");
const benchmark = read("scripts/benchmark-avantiqo-music-separator.mjs");
const benchmarkSafeLease = read("scripts/benchmark-avantiqo-music-separator-safe-lease-local.mjs");
const benchmarkLocal = read("scripts/run-avantiqo-music-separator-benchmark-local.mjs");
const certificationLocal = read("scripts/certify-avantiqo-music-separator-local.sh");
const oneShotLocal = read("scripts/run-avantiqo-music-separator-certification-local.sh");
const slotHandoff = read("scripts/handoff-avantiqo-music-generation-slot-to-separator-local.mjs");
const provision = read("scripts/provision-avantiqo-music-separator-runpod-local.mjs");
const economics = read("scripts/avantiqo-music-separator-economics.mjs");
const prepareReview = read("scripts/prepare-avantiqo-music-separator-human-review.mjs");
const finalizeReview = read("scripts/finalize-avantiqo-music-separator-human-review.mjs");
const promotionPlan = read("scripts/plan-avantiqo-music-separator-promotion.mjs");
const engine = read("lib/creative/runtime/engines/MusicEngine.js");
const provider = read("lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoMusicSeparatorProvider.js");

test("Music separator certification remains a fail-closed explicit chain", () => {
  assert.match(readiness, /CONTROLLED_SEPARATOR_BENCHMARK_EVIDENCE_REQUIRED/);
  assert.match(benchmark, /AVANTIQO_MUSIC_SEPARATOR_BENCHMARK_SPEND_APPROVED/);
  assert.match(benchmark, /AVANTIQO_MUSIC_SEPARATOR_BENCHMARK_RIGHTS_APPROVED/);
  assert.match(benchmark, /AVANTIQO_RUNPOD_SAFE_LEASE_V2/);
  assert.match(benchmark, /music-separator/);
  assert.match(benchmark, /AVANTIQO_MUSIC_SEPARATOR_BENCHMARK_SAFE_LEASE_ACTIVE_REQUIRED/);
  assert.match(benchmark, /AVANTIQO_MUSIC_SEPARATOR_BENCHMARK_SAFE_LEASE_ENDPOINT_MISMATCH/);
  assert.match(benchmark, /AVANTIQO_MUSIC_SEPARATOR_BENCHMARK_SAFE_LEASE_EXPIRED/);
  assert.match(benchmark, /provider_job_submitted:\s*true/);
  assert.match(benchmark, /safe_lease_required:\s*true/);
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

test("Music separator benchmark launchers require Safe Lease V2", () => {
  assert.match(benchmarkSafeLease, /AVANTIQO_RUNPOD_SAFE_LEASE_V2/);
  assert.match(benchmarkSafeLease, /music-separator/);
  assert.match(benchmarkSafeLease, /AVANTIQO_RUNPOD_SAFE_LEASE_ACTIVE/);
  assert.match(benchmarkSafeLease, /AVANTIQO_RUNPOD_SAFE_LEASE_ENDPOINT_ID/);
  assert.match(benchmarkSafeLease, /AVANTIQO_RUNPOD_SAFE_LEASE_EXPIRES_AT/);
  assert.match(benchmarkLocal, /AVANTIQO_RUNPOD_SAFE_LEASE_V2/);
  assert.match(benchmarkLocal, /music-separator/);
  assert.match(benchmarkLocal, /AVANTIQO_RUNPOD_SAFE_LEASE_ACTIVE/);
  assert.match(benchmarkLocal, /benchmark-avantiqo-music-separator-safe-lease-local\.mjs/);
  assert.doesNotMatch(benchmarkLocal, /await import\("\.\/benchmark-avantiqo-music-separator\.mjs"\)/);
});

test("Music separator provider cannot submit outside an exact active lease", () => {
  assert.match(provider, /AVANTIQO_MUSIC_SEPARATOR_ENGINE_CERTIFIED/);
  assert.match(provider, /AVANTIQO_RUNPOD_SAFE_LEASE_V2/);
  assert.match(provider, /music-separator/);
  assert.match(provider, /AVANTIQO_MUSIC_SEPARATOR_SAFE_LEASE_ACTIVE_REQUIRED/);
  assert.match(provider, /AVANTIQO_MUSIC_SEPARATOR_SAFE_LEASE_ENDPOINT_MISMATCH/);
  assert.match(provider, /AVANTIQO_MUSIC_SEPARATOR_SAFE_LEASE_EXPIRED/);
  assert.match(provider, /safe_lease:\s*lease/);
});

test("Music separator certification uses the proven local credential recovery path and Safe Lease", () => {
  assert.match(certificationLocal, /repair-avantiqo-runpod-env-local\.sh/);
  assert.match(certificationLocal, /run-avantiqo-runpod-safe-lease-v2-local\.mjs/);
  assert.match(certificationLocal, /--lane=music-separator/);
  assert.match(certificationLocal, /benchmark-avantiqo-music-separator-safe-lease-local\.mjs/);
  assert.doesNotMatch(certificationLocal, /node scripts\/benchmark-avantiqo-music-separator\.mjs/);
});

test("One-shot local Music separator certification is Safe Lease only and fail-closed", () => {
  assert.match(oneShotLocal, /provision-avantiqo-music-separator-runpod-local\.mjs --apply/);
  assert.match(oneShotLocal, /AVANTIQO_MUSIC_SEPARATOR_CERTIFICATION_QUOTA_MODE=YES/);
  assert.match(oneShotLocal, /AVANTIQO_MUSIC_SEPARATOR_RUNPOD_WORKERS_MAX=0/);
  assert.match(oneShotLocal, /preflight-avantiqo-music-separator-runpod-local\.mjs/);
  assert.match(oneShotLocal, /run-avantiqo-runpod-safe-lease-v2-local\.mjs/);
  assert.match(oneShotLocal, /--lane=music-separator/);
  assert.match(oneShotLocal, /benchmark-avantiqo-music-separator-safe-lease-local\.mjs/);
  assert.doesNotMatch(oneShotLocal, /handoff-avantiqo-music-generation-slot-to-separator-local\.mjs --acquire/);
  assert.doesNotMatch(oneShotLocal, /workersMax:\s*1/);
  assert.match(oneShotLocal, /AVANTIQO_MUSIC_SEPARATOR_HUMAN_REVIEW=PENDING/);
  assert.match(oneShotLocal, /AVANTIQO_MUSIC_SEPARATOR_PRODUCTION_ACTIVATION=false/);
});

test("Deprecated Music separator slot handoff can never mutate capacity", () => {
  assert.match(slotHandoff, /AVANTIQO_MUSIC_SEPARATOR_SLOT_HANDOFF_DEPRECATED_V1/);
  assert.match(slotHandoff, /DIRECT_RUNPOD_CAPACITY_HANDOFF_FORBIDDEN/);
  assert.match(slotHandoff, /AVANTIQO_RUNPOD_SAFE_LEASE_V2/);
  assert.match(slotHandoff, /music-separator/);
  assert.match(slotHandoff, /workers_opened:\s*false/);
  assert.match(slotHandoff, /endpoint_mutation_performed:\s*false/);
  assert.match(slotHandoff, /provider_job_submitted:\s*false/);
  assert.doesNotMatch(slotHandoff, /method:\s*"PATCH"/);
  assert.doesNotMatch(slotHandoff, /workersMax:\s*1/);
});

test("Music separator quota mode creates a parked endpoint without reserving another worker", () => {
  assert.match(provision, /AVANTIQO_MUSIC_SEPARATOR_CERTIFICATION_QUOTA_MODE/);
  assert.match(provision, /CERTIFICATION_QUOTA_MODE_REQUIRES_WORKERS_MAX_0/);
  assert.match(provision, /endpoint_created_paused:\s*workersMax === 0/);
  assert.match(provision, /generation_endpoint_mutation_performed:\s*false/);
  assert.match(provision, /production_deploy_performed:\s*false/);
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

test("Backing track and stems remain non-executable until benchmark and human review are promoted", () => {
  assert.match(engine, /stems:\s*Object\.freeze\([\s\S]*?implementation:\s*"IMPLEMENTED"[\s\S]*?certification:\s*"BENCHMARK_AND_HUMAN_REVIEW_REQUIRED"/);
  assert.match(engine, /backing_track:\s*Object\.freeze\([\s\S]*?implementation:\s*"IMPLEMENTED"[\s\S]*?certification:\s*"BENCHMARK_AND_HUMAN_REVIEW_REQUIRED"/);
  assert.match(engine, /implementation === "IMPLEMENTED" && certification === "CERTIFIED"/);
});
