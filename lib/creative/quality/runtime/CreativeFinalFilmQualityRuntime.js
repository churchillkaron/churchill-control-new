import {
  CreativeMediaRuntime,
} from "@/lib/creative/media/runtime/CreativeMediaRuntime";

import {
  CreativeStorageRuntime,
} from "@/lib/creative/storage/runtime/CreativeStorageRuntime";

import {
  CreativeAssetGraphRuntime,
} from "@/lib/creative/assets/graph/runtime/CreativeAssetGraphRuntime";

import {
  CREATIVE_ASSET_NODE_STATUS,
} from "@/lib/creative/assets/graph/documents/CreativeAssetNode";

import {
  ServiceExecutionRuntime,
} from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";

function parseJson(value) {
  if (!value) return null;
  if (typeof value === "object") return value;

  try {
    return JSON.parse(value);
  } catch {
    const match = String(value).match(/\{[\s\S]*\}/);
    if (!match) return null;

    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function clampScore(value) {
  return Math.max(0, Math.min(100, Number(value || 0)));
}

function normalizeReview(source = {}, minimumScore = 92) {
  const scores = {
    story_clarity: clampScore(source.scores?.story_clarity),
    emotional_arc: clampScore(source.scores?.emotional_arc),
    editorial_pacing: clampScore(source.scores?.editorial_pacing),
    shot_continuity: clampScore(source.scores?.shot_continuity),
    identity_and_product_fidelity: clampScore(
      source.scores?.identity_and_product_fidelity,
    ),
    brand_accuracy: clampScore(source.scores?.brand_accuracy),
    graphics_and_text: clampScore(source.scores?.graphics_and_text),
    color_and_visual_finish: clampScore(
      source.scores?.color_and_visual_finish,
    ),
    channel_composition: clampScore(
      source.scores?.channel_composition,
    ),
    professional_readiness: clampScore(
      source.scores?.professional_readiness,
    ),
  };
  const values = Object.values(scores);
  const overall = clampScore(
    source.overall_score ||
    values.reduce((total, value) => total + value, 0) /
      Math.max(values.length, 1),
  );
  const criticalFailures = Array.isArray(source.critical_failures)
    ? source.critical_failures.filter(Boolean)
    : [];
  const passed =
    source.passed === true &&
    overall >= Number(minimumScore || 92) &&
    criticalFailures.length === 0;

  return {
    passed,
    overall_score: overall,
    minimum_score: Number(minimumScore || 92),
    scores,
    critical_failures: criticalFailures,
    issues: Array.isArray(source.issues)
      ? source.issues.filter(Boolean)
      : [],
    correction_instructions:
      Array.isArray(source.correction_instructions)
        ? source.correction_instructions.filter(Boolean)
        : [],
    evidence: source.evidence || {},
    reviewed_at: new Date().toISOString(),
    reviewer_version: "creative-final-film-qa-v1",
  };
}

async function inspectVariant({
  organization_id,
  creative_project_id,
  package_document,
  variant,
  minimumScore,
}) {
  const contactSheet = await CreativeMediaRuntime.extractContactSheet({
    video_url: variant.public_url,
    frame_count: 16,
  });
  const stored = await CreativeStorageRuntime.uploadBuffer({
    organization_id,
    creative_project_id,
    asset_id: `final-qa-${variant.aspect_ratio.replace(":", "x")}`,
    filename: "final-film-contact-sheet.jpg",
    buffer: contactSheet.buffer,
    content_type: contactSheet.content_type,
  });
  const execution = await ServiceExecutionRuntime.execute({
    organization_id,
    service_id: "ai.image.analyze",
    operation: "CREATIVE_FINAL_FILM_QA",
    input: {
      image: stored.public_url,
      mode: "creative_final_film_qa",
      prompt: `
Act as the final senior quality board for an original world-class commercial film.
The supplied image is a chronological contact sheet from the complete sound-finished ${variant.aspect_ratio} film.
Judge the complete film against the project package below. Do not reward generic beauty.

PROJECT PACKAGE:
${JSON.stringify({
  editorial: package_document.editorial,
  graphics: package_document.graphics,
  finishing: package_document.finishing,
  final_quality_control: package_document.final_quality_control,
})}

Return strict JSON only:
{
  "passed": boolean,
  "overall_score": number,
  "scores": {
    "story_clarity": number,
    "emotional_arc": number,
    "editorial_pacing": number,
    "shot_continuity": number,
    "identity_and_product_fidelity": number,
    "brand_accuracy": number,
    "graphics_and_text": number,
    "color_and_visual_finish": number,
    "channel_composition": number,
    "professional_readiness": number
  },
  "critical_failures": ["string"],
  "issues": ["string"],
  "correction_instructions": ["specific finishing correction"],
  "evidence": {}
}

Reject missing or duplicated shots, continuity breaks, identity or product drift, incorrect logos or text, unreadable typography, unsafe crops, inconsistent color, visible AI artifacts, weak payoff, broken story logic, or any result that is not ready for professional client delivery.
Set passed true only when the overall score is at least ${minimumScore} and no critical failure exists.
      `.trim(),
    },
    metadata: {
      module: "CREATIVE",
      creative_project_id,
      operation: "FINAL_FILM_QA",
      aspect_ratio: variant.aspect_ratio,
      production_contract: "finished_atomic_film_v1",
    },
    category: "AI",
  });
  const output = execution?.output?.output || execution?.output || {};
  const parsed = parseJson(output.json || output.text);

  if (!parsed) {
    throw new Error("FINAL_FILM_QA_INVALID_RESPONSE");
  }

  const review = normalizeReview(parsed, minimumScore);
  const currentAsset = variant.asset;
  const updated = await CreativeAssetGraphRuntime.update(
    currentAsset.id,
    {
      status: review.passed
        ? CREATIVE_ASSET_NODE_STATUS.APPROVED
        : CREATIVE_ASSET_NODE_STATUS.REJECTED,
      intelligence: {
        ...(currentAsset.intelligence || {}),
        quality_score: review.overall_score,
        safety_status: review.passed
          ? "FINAL_FILM_QA_PASSED"
          : "FINAL_FILM_QA_REJECTED",
      },
      review: {
        ...(currentAsset.review || {}),
        ai_reviewed: true,
        approved: review.passed,
        notes: review.passed
          ? "Final film passed automated delivery QA."
          : review.issues.join("; "),
      },
      metadata: {
        ...(currentAsset.metadata || {}),
        final_film_qa_pending: false,
        final_film_qa: review,
        final_qa_contact_sheet_url: stored.public_url,
        delivery_status: review.passed
          ? "APPROVED_FOR_DELIVERY"
          : "REQUIRES_CORRECTION",
      },
    },
  );

  return {
    aspect_ratio: variant.aspect_ratio,
    passed: review.passed,
    review,
    evidence_url: stored.public_url,
    asset: updated,
    public_url: updated.url,
  };
}

export const CreativeFinalFilmQualityRuntime = {
  async inspect({
    organization_id,
    creative_project_id,
    package_document,
    sound_finish,
  } = {}) {
    if (!organization_id) throw new Error("organization_id required");
    if (!creative_project_id) throw new Error("creative_project_id required");

    const variants = sound_finish?.variants || [];
    if (!variants.length) throw new Error("SOUND_FINISHED_VARIANTS_REQUIRED");

    const minimumScore = Number(
      package_document?.final_quality_control?.minimum_score || 92,
    );
    const results = [];

    for (const variant of variants) {
      results.push(
        await inspectVariant({
          organization_id,
          creative_project_id,
          package_document,
          variant,
          minimumScore,
        }),
      );
    }

    return {
      stage: "FINAL_FILM_QA",
      passed: results.every((result) => result.passed),
      approved_variants: results.filter((result) => result.passed),
      rejected_variants: results.filter((result) => !result.passed),
      results,
      industry_neutral: true,
    };
  },
};
