import {
  CreativeMediaRuntime,
} from "@/lib/creative/media/runtime/CreativeMediaRuntime";

import {
  CreativeStorageRuntime,
} from "@/lib/creative/storage/runtime/CreativeStorageRuntime";

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

function score(value) {
  return Math.max(0, Math.min(100, Number(value || 0)));
}

function normalizeReview(source = {}, minimumScore = 90) {
  const scores = {
    first_frame_match: score(source.scores?.first_frame_match),
    identity_stability: score(source.scores?.identity_stability),
    product_stability: score(source.scores?.product_stability),
    logo_stability: score(source.scores?.logo_stability),
    anatomy: score(source.scores?.anatomy),
    physical_reality: score(source.scores?.physical_reality),
    camera_accuracy: score(source.scores?.camera_accuracy),
    duration_and_action: score(source.scores?.duration_and_action),
    continuity: score(source.scores?.continuity),
    temporal_stability: score(source.scores?.temporal_stability),
    technical_quality: score(source.scores?.technical_quality),
  };
  const values = Object.values(scores);
  const overall = score(
    source.overall_score ||
      values.reduce((total, value) => total + value, 0) /
        Math.max(values.length, 1),
  );
  const criticalFailures = Array.isArray(source.critical_failures)
    ? source.critical_failures.filter(Boolean)
    : [];
  const passed =
    source.passed === true &&
    overall >= Number(minimumScore || 90) &&
    criticalFailures.length === 0;

  return {
    passed,
    overall_score: overall,
    minimum_score: Number(minimumScore || 90),
    scores,
    critical_failures: criticalFailures,
    issues: Array.isArray(source.issues) ? source.issues.filter(Boolean) : [],
    correction_instructions: Array.isArray(source.correction_instructions)
      ? source.correction_instructions.filter(Boolean)
      : [],
    evidence: source.evidence || {},
    reviewed_at: new Date().toISOString(),
    reviewer_version: "creative-video-qa-v1",
  };
}

export const CreativeVideoQualityRuntime = {
  async inspect({
    organization_id,
    creative_project_id,
    production_task_id,
    video_url,
    specification = {},
    minimum_score = 90,
  } = {}) {
    if (!organization_id) throw new Error("organization_id required");
    if (!creative_project_id) throw new Error("creative_project_id required");
    if (!production_task_id) throw new Error("production_task_id required");
    if (!video_url) throw new Error("video_url required");

    const contactSheet = await CreativeMediaRuntime.extractContactSheet({
      video_url,
      frame_count: 9,
    });

    const stored = await CreativeStorageRuntime.uploadBuffer({
      organization_id,
      creative_project_id,
      asset_id: production_task_id,
      filename: contactSheet.filename,
      buffer: contactSheet.buffer,
      content_type: contactSheet.content_type,
    });

    const execution = await ServiceExecutionRuntime.execute({
      organization_id,
      service_id: "ai.image.analyze",
      operation: "CREATIVE_VIDEO_SHOT_QA",
      input: {
        image: stored.public_url,
        mode: "creative_video_contact_sheet_analysis",
        minimum_score,
        prompt: `
Act as a strict senior commercial-film motion quality supervisor.
The supplied image is a chronological contact sheet extracted from one generated video shot.
Judge the complete shot against the exact director specification below.

SHOT SPECIFICATION:
${JSON.stringify(specification)}

Return strict JSON only with:
{
  "passed": boolean,
  "overall_score": number,
  "scores": {
    "first_frame_match": number,
    "identity_stability": number,
    "product_stability": number,
    "logo_stability": number,
    "anatomy": number,
    "physical_reality": number,
    "camera_accuracy": number,
    "duration_and_action": number,
    "continuity": number,
    "temporal_stability": number,
    "technical_quality": number
  },
  "critical_failures": ["string"],
  "issues": ["string"],
  "correction_instructions": ["specific shot regeneration instruction"],
  "evidence": {}
}

Reject identity drift, product or logo deformation, anatomy errors, impossible physics, object popping, background mutation, flicker, temporal smearing, camera contradiction, action contradiction, looping, frozen motion, duplicate objects, or continuity failure.
Set passed true only when overall_score is at least ${Number(minimum_score || 90)} and no critical failure exists.
        `.trim(),
      },
      metadata: {
        module: "CREATIVE",
        operation: "VIDEO_SHOT_QA",
        production_task_id,
        production_contract: "atomic_reference_grounded_shots_v1",
      },
      category: "AI",
    });

    const parsed = parseJson(
      execution?.output?.json ||
      execution?.output?.text ||
      execution?.output?.output?.text,
    );

    if (!parsed) {
      throw new Error("VIDEO_SHOT_QA_INVALID_RESPONSE");
    }

    const review = normalizeReview(parsed, minimum_score);

    if (!review.passed) {
      const error = new Error("VIDEO_SHOT_QUALITY_REJECTED");
      error.quality_review = review;
      error.contact_sheet_url = stored.public_url;
      throw error;
    }

    return {
      ...review,
      contact_sheet_url: stored.public_url,
      contact_sheet_storage_path: stored.storage_path,
      inspected_video_url: video_url,
    };
  },
};
