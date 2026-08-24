import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const REVIEW_CONTRACT = "AVANTIQO_MUSIC_HUMAN_REVIEW_V1";
const EVIDENCE_CONTRACT = "AVANTIQO_OWNED_MEDIA_CERTIFICATION_EVIDENCE_V1";
const EXPECTED_CAPABILITY = "ai.music.generate";
const EXPECTED_MODEL = "ACE-Step/Ace-Step1.5";
const EXPECTED_VARIANT = "acestep-v15-xl-turbo";
const EXPECTED_QUALITY_PROFILE = "ACE_STEP_1_5_XL_TURBO_1_7B_LM_V1";
const EXPECTED_LM_MODEL = "acestep-5Hz-lm-1.7B";
const EXPECTED_LM_BACKEND = "vllm";

const INPUT = resolve(
  process.env.AVANTIQO_MUSIC_HUMAN_REVIEW_OUTPUT ||
    "/tmp/avantiqo-music-human-review.json",
);
const OUTPUT = resolve(
  process.env.AVANTIQO_MUSIC_CERTIFICATION_EVIDENCE_OUTPUT ||
    "/tmp/avantiqo-music-certification-evidence.json",
);

function text(value) {
  return String(value ?? "").trim();
}

function validIso(value) {
  const normalized = text(value);
  return Boolean(normalized && Number.isFinite(Date.parse(normalized)));
}

const review = JSON.parse(await readFile(INPUT, "utf8"));
if (text(review?.contract) !== REVIEW_CONTRACT) {
  throw new Error("AVANTIQO_MUSIC_HUMAN_REVIEW_CONTRACT_INVALID");
}
if (text(review?.provider) !== "avantiqo-audio") {
  throw new Error("AVANTIQO_MUSIC_HUMAN_REVIEW_PROVIDER_INVALID");
}
if (text(review?.capability) !== EXPECTED_CAPABILITY) {
  throw new Error("AVANTIQO_MUSIC_HUMAN_REVIEW_CAPABILITY_INVALID");
}
if (text(review?.model) !== EXPECTED_MODEL) {
  throw new Error("AVANTIQO_MUSIC_HUMAN_REVIEW_MODEL_INVALID");
}
if (
  text(review?.model_variant) !== EXPECTED_VARIANT ||
  text(review?.quality_profile) !== EXPECTED_QUALITY_PROFILE ||
  review?.ace_step_lm_required !== true ||
  text(review?.ace_step_lm_model) !== EXPECTED_LM_MODEL ||
  text(review?.ace_step_lm_backend) !== EXPECTED_LM_BACKEND ||
  review?.thinking_required !== true
) {
  throw new Error("AVANTIQO_MUSIC_HUMAN_REVIEW_XL_LM_CONTRACT_INVALID");
}
if (review?.automatic_human_approval_forbidden !== true || review?.activation_allowed !== false) {
  throw new Error("AVANTIQO_MUSIC_HUMAN_REVIEW_POLICY_INVALID");
}

const reviewer = text(review.reviewer);
const reviewedAt = text(review.reviewed_at);
if (!reviewer) throw new Error("AVANTIQO_MUSIC_HUMAN_REVIEW_REVIEWER_REQUIRED");
if (!validIso(reviewedAt)) throw new Error("AVANTIQO_MUSIC_HUMAN_REVIEW_REVIEWED_AT_REQUIRED");
if (text(review.review_status).toUpperCase() !== "PASS") {
  throw new Error("AVANTIQO_MUSIC_HUMAN_REVIEW_PASS_REQUIRED");
}

const items = Array.isArray(review.items) ? review.items : [];
if (!items.length) throw new Error("AVANTIQO_MUSIC_HUMAN_REVIEW_ITEMS_REQUIRED");
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
  if (item.ace_step_lm_used !== true) failures.push(`RUN_${item.run || "UNKNOWN"}:LM_REQUIRED`);
  if (item.thinking_enabled !== true) failures.push(`RUN_${item.run || "UNKNOWN"}:THINKING_REQUIRED`);
  if (reviewStatus !== "PASS") failures.push(`RUN_${item.run || "UNKNOWN"}:PASS_REQUIRED`);
  if (!itemReviewer) failures.push(`RUN_${item.run || "UNKNOWN"}:REVIEWER_REQUIRED`);
  if (!validIso(itemReviewedAt)) failures.push(`RUN_${item.run || "UNKNOWN"}:REVIEWED_AT_REQUIRED`);
  if (!item.economics || !Number.isFinite(Number(item.economics.utilization_adjusted_compute_usd))) {
    failures.push(`RUN_${item.run || "UNKNOWN"}:ECONOMICS_REQUIRED`);
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
  const requiredAverage = Number(review.minimum_average_score || 90);
  if (!Number.isFinite(averageScore) || averageScore < requiredAverage) {
    failures.push(`RUN_${item.run || "UNKNOWN"}:AVERAGE_SCORE_BELOW_${requiredAverage}`);
  }

  return {
    run: item.run || null,
    usage_id: item.usage_id || null,
    output_storage_reference: item.storage_reference || null,
    quality_profile: item.quality_profile || null,
    ace_step_lm_used: item.ace_step_lm_used === true,
    thinking_enabled: item.thinking_enabled === true,
    review_status: reviewStatus,
    reviewer: itemReviewer,
    reviewed_at: itemReviewedAt,
    average_score: Number(averageScore.toFixed(2)),
    economics: item.economics || null,
    criteria,
    human_quality_passed:
      item.technical_benchmark_passed === true &&
      text(item.quality_profile) === EXPECTED_QUALITY_PROFILE &&
      item.ace_step_lm_used === true &&
      item.thinking_enabled === true &&
      reviewStatus === "PASS" &&
      criteria.length > 0 &&
      criteria.every((entry) => entry.passed) &&
      averageScore >= requiredAverage,
  };
});

if (failures.length) {
  throw new Error(`AVANTIQO_MUSIC_HUMAN_REVIEW_INCOMPLETE:${failures.join(",")}`);
}

const evidence = {
  contract: EVIDENCE_CONTRACT,
  generated_at: new Date().toISOString(),
  source_review_contract: REVIEW_CONTRACT,
  source_scope: "BENCHMARK_ONLY",
  benchmark_id: review.benchmark_id || null,
  economics_contract: review.economics_contract || null,
  capability_count: 1,
  mechanically_certified_for_review: reviewedItems.every((item) => item.human_quality_passed),
  economics_evidence_complete: reviewedItems.every(
    (item) => Number.isFinite(Number(item.economics?.utilization_adjusted_compute_usd)),
  ),
  human_quality_certified: reviewedItems.every((item) => item.human_quality_passed),
  capabilities: [{
    engine: "avantiqo-audio",
    capability: EXPECTED_CAPABILITY,
    model: EXPECTED_MODEL,
    model_family: "ACE_STEP_1_5",
    model_variant: EXPECTED_VARIANT,
    quality_profile: EXPECTED_QUALITY_PROFILE,
    ace_step_lm_required: true,
    ace_step_lm_model: EXPECTED_LM_MODEL,
    ace_step_lm_backend: EXPECTED_LM_BACKEND,
    thinking_required: true,
    reviewer,
    reviewed_at: reviewedAt,
    human_quality_passed: true,
    benchmark_id: review.benchmark_id || null,
    runs: reviewedItems,
  }],
  production_certified: false,
  pricing_status: "NOT_PRODUCTION_CERTIFIED",
  activation_allowed: false,
  provider_selection_changed: false,
  pricing_activation_performed: false,
  final_certification_required: true,
  final_certification_requirements: {
    model_license_gate: true,
    exact_reviewed_model_binding: true,
    exact_model_variant_binding: true,
    exact_quality_profile_binding: true,
    ace_step_lm_binding: true,
    thinking_binding: true,
    exact_capability_binding: true,
    capability_specific_quality_evidence: true,
    economics_evidence: true,
    explicit_pricing_status_promotion: true,
    explicit_provider_certification_promotion: true,
    automatic_activation_forbidden: true,
  },
};

await writeFile(OUTPUT, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  success: true,
  output_path: OUTPUT,
  capability: EXPECTED_CAPABILITY,
  quality_profile: EXPECTED_QUALITY_PROFILE,
  human_quality_certified: true,
  economics_evidence_complete: true,
  production_certified: false,
  activation_allowed: false,
}, null, 2));
