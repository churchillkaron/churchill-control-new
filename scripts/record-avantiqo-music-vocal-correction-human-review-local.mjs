#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const CONTRACT = "AVANTIQO_MUSIC_VOCAL_CORRECTION_HUMAN_REVIEW_RESULT_V1";
const REVIEW_PACKET_CONTRACT = "AVANTIQO_MUSIC_VOCAL_CORRECTION_HUMAN_REVIEW_V2";
const WORKSTATION_CERTIFICATION_CONTRACT = "AVANTIQO_MUSIC_VOCAL_CORRECTION_WORKSTATION_CERTIFICATION_V2";

const text = (value) => String(value ?? "").trim();
const finite = (value, fallback = null) => Number.isFinite(Number(value)) ? Number(value) : fallback;
function arg(prefix) { return text(process.argv.slice(2).find((entry) => entry.startsWith(prefix))?.slice(prefix.length)); }
function requiredArg(prefix, code) { const value = arg(prefix); if (!value) throw new Error(code); return value; }

const reviewPath = resolve(requiredArg("--review=", "AVANTIQO_MUSIC_VOCAL_CORRECTION_HUMAN_REVIEW_PACKET_REQUIRED"));
const verdict = requiredArg("--verdict=", "AVANTIQO_MUSIC_VOCAL_CORRECTION_HUMAN_REVIEW_VERDICT_REQUIRED").toUpperCase();
if (!["APPROVED", "REJECTED"].includes(verdict)) throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_HUMAN_REVIEW_VERDICT_INVALID");
const reviewer = requiredArg("--reviewer=", "AVANTIQO_MUSIC_VOCAL_CORRECTION_HUMAN_REVIEWER_REQUIRED");
const notes = arg("--notes=") || null;

const review = JSON.parse(await readFile(reviewPath, "utf8"));
if (
  review?.success !== true ||
  text(review?.contract) !== REVIEW_PACKET_CONTRACT ||
  text(review?.certification_contract) !== WORKSTATION_CERTIFICATION_CONTRACT ||
  text(review?.certification_mode) !== "MUSICIAN_APPROVED_PLAN" ||
  text(review?.review_status) !== "PENDING" ||
  review?.reviewer_identity_required !== true ||
  review?.activation_allowed !== false ||
  review?.production_certified !== false ||
  review?.pricing_activation_allowed !== false ||
  review?.automatic_human_approval_forbidden !== true ||
  review?.minimum_policy?.every_criterion_must_be_scored_by_human !== true ||
  review?.minimum_policy?.automatic_score_generation_forbidden !== true ||
  review?.minimum_policy?.automatic_approval_forbidden !== true ||
  review?.minimum_policy?.reviewer_must_compare_source_and_corrected_audio !== true ||
  review?.minimum_policy?.workstation_review_must_match_certified_plan_fingerprints !== true ||
  review?.reviewed_plan_evidence?.exact_musician_reviewed_plans !== true ||
  review?.reviewed_plan_evidence?.automatic_timing_forbidden !== true ||
  review?.technical_context?.pitch_correction_complete !== true ||
  review?.technical_context?.phrase_timing_correction_complete !== true ||
  review?.technical_context?.correction_pipeline_complete !== true ||
  review?.technical_context?.time_stretch_used === true ||
  review?.technical_context?.syllable_warp_applied === true ||
  review?.technical_context?.formant_preservation_claimed !== false
) {
  throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_HUMAN_REVIEW_PACKET_NOT_ELIGIBLE");
}

const criteria = Array.isArray(review.criteria) ? review.criteria : [];
if (!criteria.length) throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_HUMAN_REVIEW_CRITERIA_REQUIRED");
const scoredCriteria = criteria.map((criterion) => {
  const id = text(criterion?.id);
  if (!id) throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_HUMAN_REVIEW_CRITERION_ID_REQUIRED");
  const raw = arg(`--score-${id}=`);
  if (!raw) throw new Error(`AVANTIQO_MUSIC_VOCAL_CORRECTION_HUMAN_REVIEW_SCORE_REQUIRED:${id}`);
  const score = finite(raw, null);
  if (score === null || score < 0 || score > 100) throw new Error(`AVANTIQO_MUSIC_VOCAL_CORRECTION_HUMAN_REVIEW_SCORE_INVALID:${id}`);
  return {
    id,
    question: criterion.question || null,
    score_0_to_100: score,
  };
});

const threshold = 80;
const minimumScore = Math.min(...scoredCriteria.map((criterion) => criterion.score_0_to_100));
const meanScore = scoredCriteria.reduce((sum, criterion) => sum + criterion.score_0_to_100, 0) / scoredCriteria.length;
if (verdict === "APPROVED" && minimumScore < threshold) {
  throw new Error(`AVANTIQO_MUSIC_VOCAL_CORRECTION_HUMAN_REVIEW_APPROVAL_SCORE_BELOW_POLICY:${minimumScore}`);
}

const result = {
  success: true,
  contract: CONTRACT,
  generated_at: new Date().toISOString(),
  review_packet_contract: REVIEW_PACKET_CONTRACT,
  review_packet_path: reviewPath,
  certification_contract: review.certification_contract,
  certification_mode: review.certification_mode,
  certification_job_id: review.certification_job_id || null,
  reviewer,
  notes,
  human_review_required: true,
  human_review_status: verdict,
  criteria: scoredCriteria,
  minimum_score_0_to_100: minimumScore,
  mean_score_0_to_100: Math.round(meanScore * 100) / 100,
  approval_policy: {
    minimum_each_criterion: threshold,
    all_criteria_scored_by_human: true,
    automatic_approval_forbidden: true,
    source_corrected_comparison_required: true,
    material_artifact_requires_reject: true,
  },
  reviewed_plan_evidence: review.reviewed_plan_evidence,
  technical_context: review.technical_context,
  production_activation_allowed: false,
  pricing_activation_allowed: false,
  provider_selection_change_allowed: false,
  provider_jobs_submitted: 0,
  runpod_lease_opened: false,
  production_activation_performed: false,
  pricing_activation_performed: false,
  provider_selection_change_performed: false,
  eligible_for_later_release_decision: verdict === "APPROVED",
};

const defaultName = `/tmp/music-vocal-correction-human-review-${text(review.certification_job_id) || Date.now()}.json`;
const outputPath = resolve(arg("--output=") || defaultName);
await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  human_review_status: verdict,
  minimum_score_0_to_100: minimumScore,
  mean_score_0_to_100: result.mean_score_0_to_100,
  eligible_for_later_release_decision: result.eligible_for_later_release_decision,
  provider_jobs_submitted: 0,
  runpod_lease_opened: false,
  production_activation_performed: false,
  pricing_activation_performed: false,
  output_path: outputPath,
}, null, 2));
