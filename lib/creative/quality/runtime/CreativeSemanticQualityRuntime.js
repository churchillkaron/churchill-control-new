import crypto from "node:crypto";

import {
  createCreativeAssetNode,
  CREATIVE_ASSET_NODE_STATUS,
  CREATIVE_ASSET_NODE_TYPES,
} from "@/lib/creative/assets/graph/documents/CreativeAssetNode";
import * as AssetGraphRepository
from "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository";

export const CREATIVE_SEMANTIC_QUALITY_CHECKS = Object.freeze([
  "identity_continuity",
  "product_continuity",
  "anatomy_and_object_integrity",
  "physics_and_contact",
  "reflections_shadows_and_object_permanence",
  "camera_plausibility",
  "motion_cadence",
  "performance_authenticity",
  "lip_synchronisation",
  "production_design_coherence",
  "environmental_coherence",
  "generated_text_integrity",
  "exposure_colour_and_texture",
  "compression_consistency",
  "shot_purpose",
  "narrative_progression",
  "pacing_and_transitions",
  "emotional_arc",
  "music_and_sound_design",
  "mix_hierarchy_and_silence",
  "brand_truth_and_claims",
  "cultural_fit",
  "accessibility",
  "subtitle_integrity",
  "safe_area_and_channel_composition",
  "repetitive_model_signatures",
  "detectable_synthetic_artifacts",
]);

const CHECK_IDS = new Set(CREATIVE_SEMANTIC_QUALITY_CHECKS);

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function text(value) {
  return String(value ?? "").trim();
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function reviewIdentity(render, review, policy) {
  return crypto.createHash("sha256").update(JSON.stringify({
    render_id: render.id,
    checksum: render.technical?.checksum || null,
    review_version: review.version || null,
    policy_version: policy.version || null,
    reviewer: review.reviewer || null,
    policy,
  })).digest("hex");
}

function normalizeCheck(id, value = {}) {
  const check = object(value);
  const confidence = finite(check.confidence);
  const score = finite(check.score);
  return {
    id,
    status: text(check.status).toUpperCase(),
    passed: check.passed === true,
    score,
    confidence,
    evidence: list(check.evidence),
    timestamps: list(check.timestamps),
    affected_scene_ids: list(check.affected_scene_ids),
    affected_shot_ids: list(check.affected_shot_ids),
    risks: list(check.risks),
    repair_instructions: list(check.repair_instructions),
  };
}

function validatePolicy(policy = {}) {
  const failures = [];
  const requiredChecks = [...new Set(list(policy.required_checks).map(text).filter(Boolean))];
  const minimumConfidence = finite(policy.minimum_confidence);
  const minimumScore = finite(policy.minimum_score);
  const requireAudioReview = policy.require_audio_review;
  const version = text(policy.version);

  if (!version) failures.push({ code: "SEMANTIC_POLICY_VERSION_REQUIRED" });
  if (!requiredChecks.length) {
    failures.push({ code: "SEMANTIC_REQUIRED_CHECKS_POLICY_REQUIRED" });
  }
  const unknownChecks = requiredChecks.filter((id) => !CHECK_IDS.has(id));
  if (unknownChecks.length) {
    failures.push({
      code: "SEMANTIC_REQUIRED_CHECKS_INVALID",
      check_ids: unknownChecks,
    });
  }
  if (
    minimumConfidence === null ||
    minimumConfidence < 0 ||
    minimumConfidence > 100
  ) {
    failures.push({
      code: "SEMANTIC_MINIMUM_CONFIDENCE_POLICY_INVALID",
      actual: policy.minimum_confidence,
    });
  }
  if (minimumScore === null || minimumScore < 0 || minimumScore > 100) {
    failures.push({
      code: "SEMANTIC_MINIMUM_SCORE_POLICY_INVALID",
      actual: policy.minimum_score,
    });
  }
  if (typeof requireAudioReview !== "boolean") {
    failures.push({ code: "SEMANTIC_AUDIO_REVIEW_POLICY_REQUIRED" });
  }

  return {
    failures,
    required_checks: requiredChecks,
    minimum_confidence: minimumConfidence,
    minimum_score: minimumScore,
    require_audio_review: requireAudioReview,
    version,
  };
}

function validateReview(review = {}, policy = {}) {
  const policyValidation = validatePolicy(policy);
  const failures = [...policyValidation.failures];
  const checksInput = object(review.checks);
  const checks = policyValidation.required_checks.map((id) =>
    normalizeCheck(id, checksInput[id]));

  for (const check of checks) {
    if (!check.status || !["PASS", "FAIL", "NOT_APPLICABLE"].includes(check.status)) {
      failures.push({
        code: "SEMANTIC_CHECK_STATUS_REQUIRED",
        check_id: check.id,
      });
      continue;
    }
    if (check.status === "NOT_APPLICABLE") {
      if (!check.evidence.length) {
        failures.push({
          code: "NOT_APPLICABLE_EVIDENCE_REQUIRED",
          check_id: check.id,
        });
      }
      continue;
    }
    if (!check.evidence.length) {
      failures.push({
        code: "SEMANTIC_CHECK_EVIDENCE_REQUIRED",
        check_id: check.id,
      });
    }
    if (
      check.confidence === null ||
      check.confidence < 0 ||
      check.confidence > 100
    ) {
      failures.push({
        code: "SEMANTIC_CHECK_CONFIDENCE_INVALID",
        check_id: check.id,
        actual: check.confidence,
      });
    } else if (
      policyValidation.minimum_confidence !== null &&
      check.confidence < policyValidation.minimum_confidence
    ) {
      failures.push({
        code: "SEMANTIC_CHECK_CONFIDENCE_LOW",
        check_id: check.id,
        actual: check.confidence,
        minimum: policyValidation.minimum_confidence,
      });
    }
    if (check.score === null || check.score < 0 || check.score > 100) {
      failures.push({
        code: "SEMANTIC_CHECK_SCORE_INVALID",
        check_id: check.id,
        actual: check.score,
      });
    }
    if (check.status === "PASS" && check.passed !== true) {
      failures.push({
        code: "SEMANTIC_CHECK_PASS_FLAG_REQUIRED",
        check_id: check.id,
      });
    }
    if (
      check.status === "PASS" &&
      check.score !== null &&
      policyValidation.minimum_score !== null &&
      check.score < policyValidation.minimum_score
    ) {
      failures.push({
        code: "SEMANTIC_CHECK_SCORE_LOW",
        check_id: check.id,
        actual: check.score,
        minimum: policyValidation.minimum_score,
      });
    }
    if (check.status === "FAIL" && check.passed === true) {
      failures.push({
        code: "SEMANTIC_CHECK_FAIL_FLAG_INVALID",
        check_id: check.id,
      });
    }
    if (check.status === "FAIL" && !check.repair_instructions.length) {
      failures.push({
        code: "SEMANTIC_REPAIR_INSTRUCTIONS_REQUIRED",
        check_id: check.id,
      });
    }
  }

  const sampledFrames = list(review.sampled_frames);
  const sampledClips = list(review.sampled_clips);
  const sampledAudio = list(review.sampled_audio_segments);
  if (!sampledFrames.length && !sampledClips.length) {
    failures.push({ code: "VISUAL_SAMPLE_EVIDENCE_REQUIRED" });
  }
  if (policyValidation.require_audio_review === true && !sampledAudio.length) {
    failures.push({ code: "AUDIO_SAMPLE_EVIDENCE_REQUIRED" });
  }
  if (!text(review.summary)) failures.push({ code: "SEMANTIC_REVIEW_SUMMARY_REQUIRED" });
  if (!text(review.reviewer)) failures.push({ code: "SEMANTIC_REVIEWER_REQUIRED" });
  if (!text(review.version)) failures.push({ code: "SEMANTIC_REVIEW_VERSION_REQUIRED" });

  const failedChecks = checks.filter((check) => check.status === "FAIL");
  const passed = failures.length === 0 && failedChecks.length === 0;
  const scored = checks.filter((check) =>
    check.score !== null && check.status !== "NOT_APPLICABLE");
  const overallScore = scored.length
    ? Math.round(scored.reduce((sum, check) => sum + check.score, 0) / scored.length)
    : null;

  return {
    passed,
    overall_score: overallScore,
    policy: {
      version: policyValidation.version || null,
      required_checks: policyValidation.required_checks,
      minimum_confidence: policyValidation.minimum_confidence,
      minimum_score: policyValidation.minimum_score,
      require_audio_review: policyValidation.require_audio_review,
    },
    checks,
    failed_checks: failedChecks.map((check) => check.id),
    validation_failures: failures,
    sampled_frames: sampledFrames,
    sampled_clips: sampledClips,
    sampled_audio_segments: sampledAudio,
    repair_plan: failedChecks.flatMap((check) =>
      check.repair_instructions.map((instruction) => ({
        check_id: check.id,
        instruction,
        affected_scene_ids: check.affected_scene_ids,
        affected_shot_ids: check.affected_shot_ids,
        timestamps: check.timestamps,
      })),
    ),
  };
}

export const CreativeSemanticQualityRuntime = {
  validate(review = {}, policy = {}) {
    return validateReview(review, policy);
  },

  async record({
    organization_id,
    render_asset_node_id,
    review = {},
    policy = {},
    force = false,
  } = {}) {
    if (!organization_id) throw new Error("organization_id required");
    if (!render_asset_node_id) throw new Error("render_asset_node_id required");

    const render = await AssetGraphRepository.getById(render_asset_node_id);
    if (
      !render ||
      render.organization_id !== organization_id ||
      render.type !== CREATIVE_ASSET_NODE_TYPES.FINAL_RENDER
    ) {
      throw new Error("Final render asset not found");
    }

    const identity = reviewIdentity(render, review, policy);
    const projectNodes = await AssetGraphRepository.listByProject({
      organization_id,
      creative_project_id: render.creative_project_id,
    });
    const existing = !force
      ? projectNodes.find((node) =>
          node.type === CREATIVE_ASSET_NODE_TYPES.QUALITY_REPORT &&
          node.metadata?.semantic_quality_identity === identity,
        )
      : null;
    if (existing) return { report: existing, reused: true };

    const evaluation = validateReview(review, policy);
    const node = createCreativeAssetNode({
      organization_id,
      creative_project_id: render.creative_project_id,
      parent_asset_node_id: render.id,
      type: CREATIVE_ASSET_NODE_TYPES.QUALITY_REPORT,
      status: evaluation.passed
        ? CREATIVE_ASSET_NODE_STATUS.REVIEW
        : CREATIVE_ASSET_NODE_STATUS.REJECTED,
      name: `${render.name || "Render"} semantic quality review`,
      description: review.summary || "Evidence-based semantic and perceptual quality review.",
      lineage: {
        source: "semantic_quality_review",
        capability: "creative.render.quality.semantic",
        generation_version: policy.version || review.version || 1,
      },
      intelligence: {
        quality_score: evaluation.overall_score,
        safety_status: evaluation.passed ? "REVIEW_REQUIRED" : "REJECTED",
        tags: ["semantic-quality", "perceptual-review"],
      },
      reuse: { reusable: false, approved_for_reuse: false },
      review: {
        ai_reviewed: review.reviewer_type === "AI" || review.ai_reviewed === true,
        human_reviewed: review.reviewer_type === "HUMAN" || review.human_reviewed === true,
        approved: false,
        approved_by: review.reviewed_by || null,
        notes: review.summary || "",
      },
      metadata: {
        semantic_quality_identity: identity,
        render_asset_node_id: render.id,
        reviewer: review.reviewer || null,
        reviewer_type: review.reviewer_type || null,
        review_version: review.version || null,
        policy: evaluation.policy,
        ...evaluation,
        created_at: new Date().toISOString(),
      },
    });

    return {
      report: await AssetGraphRepository.create(node),
      reused: false,
    };
  },
};
