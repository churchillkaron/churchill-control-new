#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const REVIEW_CONTRACT = "AVANTIQO_MUSIC_SEPARATOR_HUMAN_REVIEW_V1";
const EVIDENCE_CONTRACT = "AVANTIQO_OWNED_MEDIA_CERTIFICATION_EVIDENCE_V1";
const EXPECTED_PROVIDER = "avantiqo-audio";
const EXPECTED_CAPABILITY = "ai.audio.stems";
const EXPECTED_CATALOG_MODEL = "facebookresearch/demucs:htdemucs_ft";
const EXPECTED_RUNTIME_MODEL = "demucs-htdemucs-ft";
const EXPECTED_QUALITY_PROFILE = "DEMUCS_HTDEMUCS_FT_4STEM_V1";

const INPUT = resolve(
  process.env.AVANTIQO_MUSIC_SEPARATOR_HUMAN_REVIEW_OUTPUT ||
    "/tmp/avantiqo-music-separator-human-review.json",
);
const OUTPUT = resolve(
  process.env.AVANTIQO_MUSIC_SEPARATOR_CERTIFICATION_EVIDENCE_OUTPUT ||
    "/tmp/avantiqo-music-separator-certification-evidence.json",
);

function text(value) {
  return String(value ?? "").trim();
}

function validIso(value) {
  const normalized = text(value);
  return Boolean(normalized && Number.isFinite(Date.parse(normalized)));
}

const review = JSON.parse(await readFile(INPUT, "utf8"));
const contractChecks = [
  text(review?.contract) === REVIEW_CONTRACT,
  text(review?.provider) === EXPECTED_PROVIDER,
  text(review?.capability) === EXPECTED_CAPABILITY,
  text(review?.catalog_model) === EXPECTED_CATALOG_MODEL,
  text(review?.runtime_model) === EXPECTED_RUNTIME_MODEL,
  text(review?.quality_profile) === EXPECTED_QUALITY_PROFILE,
  review?.automatic_human_approval_forbidden === true,
  review?.activation_allowed === false,
  review?.rights_attestation_confirmed === true,
];
if (!contractChecks.every(Boolean)) {
  throw new Error("AVANTIQO_MUSIC_SEPARATOR_HUMAN_REVIEW_CONTRACT_INVALID");
}

const reviewer = text(review.reviewer);
const reviewedAt = text(review.reviewed_at);
if (!reviewer) throw new Error("AVANTIQO_MUSIC_SEPARATOR_HUMAN_REVIEW_REVIEWER_REQUIRED");
if (!validIso(reviewedAt)) throw new Error("AVANTIQO_MUSIC_SEPARATOR_HUMAN_REVIEW_REVIEWED_AT_REQUIRED");
if (text(review.review_status).toUpperCase() !== "PASS") {
  throw new Error("AVANTIQO_MUSIC_SEPARATOR_HUMAN_REVIEW_PASS_REQUIRED");
}

const items = Array.isArray(review.items) ? review.items : [];
if (!items.length) throw new Error("AVANTIQO_MUSIC_SEPARATOR_HUMAN_REVIEW_ITEMS_REQUIRED");
const requiredAverage = Number(review.minimum_average_score || 92);
const failures = [];

const reviewedItems = items.map((item) => {
  const itemReviewer = text(item.reviewer || reviewer);
  const itemReviewedAt = text(item.reviewed_at || reviewedAt);
  const reviewStatus = text(item.review_status).toUpperCase();
  if (item.technical_benchmark_passed !== true) {
    failures.push(`RUN_${item.run || "UNKNOWN"}:TECHNICAL_BENCHMARK_REQUIRED`);
  }
  if (text(item.quality_profile) !== EXPECTED_QUALITY_PROFILE) {
    failures.push(`RUN_${item.run || "UNKNOWN"}:QUALITY_PROFILE_REQUIRED`);
  }
  if (reviewStatus !== "PASS") failures.push(`RUN_${item.run || "UNKNOWN"}:PASS_REQUIRED`);
  if (!itemReviewer) failures.push(`RUN_${item.run || "UNKNOWN"}:REVIEWER_REQUIRED`);
  if (!validIso(itemReviewedAt)) failures.push(`RUN_${item.run || "UNKNOWN"}:REVIEWED_AT_REQUIRED`);
  if (!item.economics || !Number.isFinite(Number(item.economics.utilization_adjusted_compute_usd))) {
    failures.push(`RUN_${item.run || "UNKNOWN"}:ECONOMICS_REQUIRED`);
  }
  if (!Array.isArray(item.stem_names) || item.stem_names.length !== 4) {
    failures.push(`RUN_${item.run || "UNKNOWN"}:FOUR_STEMS_REQUIRED`);
  }
  if (!item.storage_references?.backing_track_wav || !item.storage_references?.backing_track_mp3) {
    failures.push(`RUN_${item.run || "UNKNOWN"}:BACKING_OUTPUTS_REQUIRED`);
  }

  const criteria = (Array.isArray(item.criteria) ? item.criteria : []).map((entry) => {
    const criterion = text(entry.criterion);
    const score = Number(entry.score_0_100);
    const minimum = Number(entry.minimum_score);
    const status = text(entry.status).toUpperCase();
    const evidenceNote = text(entry.evidence_note);
    const passed =
      Boolean(criterion) &&
      status === "PASS" &&
      Number.isFinite(score) &&
      Number.isFinite(minimum) &&
      score >= minimum &&
      score <= 100 &&
      evidenceNote.length >= 8;
    if (!passed) failures.push(`RUN_${item.run || "UNKNOWN"}:${criterion || "UNKNOWN"}:FAILED`);
    return {
      criterion,
      status,
      score_0_100: score,
      minimum_score: minimum,
      evidence_note: evidenceNote,
      passed,
    };
  });
  if (!criteria.length) failures.push(`RUN_${item.run || "UNKNOWN"}:CRITERIA_REQUIRED`);

  const averageScore = criteria.length
    ? criteria.reduce((sum, entry) => sum + entry.score_0_100, 0) / criteria.length
    : 0;
  if (!Number.isFinite(averageScore) || averageScore < requiredAverage) {
    failures.push(`RUN_${item.run || "UNKNOWN"}:AVERAGE_SCORE_BELOW_${requiredAverage}`);
  }

  const humanQualityPassed =
    item.technical_benchmark_passed === true &&
    text(item.quality_profile) === EXPECTED_QUALITY_PROFILE &&
    reviewStatus === "PASS" &&
    criteria.length > 0 &&
    criteria.every((entry) => entry.passed) &&
    averageScore >= requiredAverage;

  return {
    run: item.run || null,
    runpod_job_id: item.runpod_job_id || null,
    source_duration_seconds: item.source_duration_seconds || null,
    source_storage_reference: item.source_storage_reference || null,
    output_storage_references: item.storage_references || {},
    quality_profile: item.quality_profile || null,
    review_status: reviewStatus,
    reviewer: itemReviewer,
    reviewed_at: itemReviewedAt,
    average_score: Number(averageScore.toFixed(2)),
    economics: item.economics || null,
    criteria,
    human_quality_passed: humanQualityPassed,
  };
});

if (failures.length) {
  throw new Error(`AVANTIQO_MUSIC_SEPARATOR_HUMAN_REVIEW_INCOMPLETE:${failures.join(",")}`);
}

const evidence = {
  success: true,
  contract: EVIDENCE_CONTRACT,
  generated_at: new Date().toISOString(),
  source_review_contract: REVIEW_CONTRACT,
  source_scope: "CONTROLLED_SEPARATOR_BENCHMARK_ONLY",
  benchmark_id: review.benchmark_id || null,
  economics_contract: review.economics_contract || null,
  capability_count: 1,
  mechanically_certified_for_review: reviewedItems.every((item) => item.human_quality_passed),
  economics_evidence_complete: reviewedItems.every(
    (item) => Number.isFinite(Number(item.economics?.utilization_adjusted_compute_usd)),
  ),
  human_quality_certified: reviewedItems.every((item) => item.human_quality_passed),
  capabilities: [{
    engine: EXPECTED_PROVIDER,
    capability: EXPECTED_CAPABILITY,
    catalog_model: EXPECTED_CATALOG_MODEL,
    runtime_model: EXPECTED_RUNTIME_MODEL,
    model_family: "DEMUCS",
    model_variant: "htdemucs_ft",
    quality_profile: EXPECTED_QUALITY_PROFILE,
    rights_attestation_contract: review.rights_attestation_contract || null,
    rights_attestation_confirmed: review.rights_attestation_confirmed === true,
    reviewer,
    reviewed_at: reviewedAt,
    human_quality_passed: true,
    benchmark_id: review.benchmark_id || null,
    runs: reviewedItems,
  }],
  production_certified: false,
  production_routing_allowed: false,
  pricing_status: "NOT_PRODUCTION_CERTIFIED",
  activation_allowed: false,
  provider_selection_changed: false,
  pricing_activation_performed: false,
  provider_certification_mutation_performed: false,
  final_certification_required: true,
  final_certification_requirements: {
    model_license_gate: true,
    exact_catalog_model_binding: true,
    exact_runtime_model_binding: true,
    exact_quality_profile_binding: true,
    exact_capability_binding: true,
    capability_specific_quality_evidence: true,
    source_rights_evidence: true,
    economics_evidence: true,
    explicit_provider_certification_promotion: true,
    explicit_production_routing_promotion: true,
    explicit_pricing_status_promotion: true,
    automatic_activation_forbidden: true,
  },
};

await writeFile(OUTPUT, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  success: true,
  output_path: OUTPUT,
  contract: EVIDENCE_CONTRACT,
  capability: EXPECTED_CAPABILITY,
  human_quality_certified: evidence.human_quality_certified,
  economics_evidence_complete: evidence.economics_evidence_complete,
  production_certified: false,
  production_routing_allowed: false,
  pricing_activation_performed: false,
  activation_allowed: false,
}, null, 2));
