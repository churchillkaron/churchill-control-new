#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const CONTRACT = "AVANTIQO_MUSIC_VOCAL_CORRECTION_HUMAN_REVIEW_V1";
const CERTIFICATION_CONTRACT = "AVANTIQO_MUSIC_VOCAL_CORRECTION_SAFE_LEASE_CERTIFICATION_V1";
const INPUT = resolve(
  process.env.AVANTIQO_MUSIC_VOCAL_CORRECTION_CERTIFICATION_OUTPUT ||
    "/tmp/avantiqo-music-vocal-correction-certification.json",
);
const OUTPUT = resolve(
  process.env.AVANTIQO_MUSIC_VOCAL_CORRECTION_HUMAN_REVIEW_OUTPUT ||
    "/tmp/avantiqo-music-vocal-correction-human-review.json",
);

function text(value) {
  return String(value ?? "").trim();
}

const certification = JSON.parse(await readFile(INPUT, "utf8"));
if (
  certification?.success !== true ||
  text(certification?.contract) !== CERTIFICATION_CONTRACT ||
  certification?.technical?.correction_pipeline_complete !== true ||
  certification?.human_review?.required !== true ||
  certification?.production_certified !== false ||
  certification?.production_activation_allowed !== false ||
  certification?.job_count_submitted !== 1 ||
  certification?.provider_job_count !== 1
) {
  throw new Error("AVANTIQO_MUSIC_VOCAL_CORRECTION_HUMAN_REVIEW_TECHNICAL_CERTIFICATION_REQUIRED");
}

const review = {
  success: true,
  contract: CONTRACT,
  certification_contract: CERTIFICATION_CONTRACT,
  certification_job_id: certification.job_id || null,
  review_status: "PENDING",
  reviewer_identity_required: true,
  review_completed_at: null,
  source_reference: certification.fixture?.storage_reference || null,
  corrected_vocal_reference: certification.outputs?.corrected_vocal_wav || null,
  correction_report_reference: certification.outputs?.correction_report_json || null,
  technical_context: {
    pitch_status: certification.technical?.pitch_status || null,
    pitch_correction_complete: certification.technical?.pitch_correction_complete === true,
    phrase_timing_correction_complete: certification.technical?.phrase_timing_correction_complete === true,
    correction_pipeline_complete: certification.technical?.correction_pipeline_complete === true,
    formant_compensation_explicitly_configured: false,
    formant_preservation_claimed: false,
  },
  criteria: [
    {
      id: "pitch_naturalness",
      question: "Does corrected pitch sound intentional and musical without robotic snapping or unstable note transitions?",
      score_0_to_100: null,
      notes: null,
    },
    {
      id: "vibrato_preservation",
      question: "Is natural vibrato preserved rather than flattened, exaggerated, or modulated unnaturally?",
      score_0_to_100: null,
      notes: null,
    },
    {
      id: "timbre_and_formant_naturalness",
      question: "Does vocal identity and timbre remain natural, with no chipmunk, hollow, metallic, or shifted-formant character?",
      score_0_to_100: null,
      notes: null,
    },
    {
      id: "consonant_and_transient_integrity",
      question: "Are consonants, attacks, breaths, and transients intact without smearing, doubling, or clicks?",
      score_0_to_100: null,
      notes: null,
    },
    {
      id: "artifact_control",
      question: "Are audible stretching, phase, warble, zipper, discontinuity, or crossfade artifacts absent or negligible?",
      score_0_to_100: null,
      notes: null,
    },
    {
      id: "timing_naturalness",
      question: "Are phrase moves rhythmically improved while still sounding human and preserving internal phrase timing?",
      score_0_to_100: null,
      notes: null,
    },
    {
      id: "emotional_phrasing_preservation",
      question: "Are expressive phrasing, intentional pushes/pulls, breath timing, and emotional delivery preserved?",
      score_0_to_100: null,
      notes: null,
    },
    {
      id: "before_after_improvement",
      question: "Is the corrected version clearly better than the source without introducing a more serious defect?",
      score_0_to_100: null,
      notes: null,
    },
    {
      id: "commercial_readiness",
      question: "Would this correction quality be acceptable in a professional release workflow before final mix/master?",
      score_0_to_100: null,
      notes: null,
    },
  ],
  decision: null,
  decision_values: ["APPROVE", "REJECT"],
  minimum_policy: {
    every_criterion_must_be_scored_by_human: true,
    automatic_score_generation_forbidden: true,
    automatic_approval_forbidden: true,
    reviewer_must_compare_source_and_corrected_audio: true,
    material_artifact_requires_reject: true,
    false_formant_preservation_claim_forbidden: true,
  },
  activation_allowed: false,
  production_certified: false,
  pricing_activation_allowed: false,
  production_deploy_performed: false,
  automatic_human_approval_forbidden: true,
};

await writeFile(OUTPUT, `${JSON.stringify(review, null, 2)}\n`, "utf8");
console.log(JSON.stringify(review, null, 2));
