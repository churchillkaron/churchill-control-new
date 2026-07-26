export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";
import {
  CreativePerceptualQualityRuntime,
} from "@/lib/creative/quality/runtime/CreativePerceptualQualityRuntime";
import {
  CreativeSemanticQualityRuntime,
} from "@/lib/creative/quality/runtime/CreativeSemanticQualityRuntime";
import {
  CreativeAutonomousSemanticReviewRuntime,
} from "@/lib/creative/quality/runtime/CreativeAutonomousSemanticReviewRuntime";

const POLICY_FIELDS = new Set([
  "black_picture_threshold", "blackPictureThreshold",
  "black_pixel_threshold", "blackPixelThreshold",
  "max_black_duration_seconds", "maxBlackDurationSeconds",
  "freeze_noise", "freezeNoise",
  "max_freeze_duration_seconds", "maxFreezeDurationSeconds",
  "silence_noise_db", "silenceNoiseDb",
  "max_silence_duration_seconds", "maxSilenceDurationSeconds",
  "target_integrated_lufs", "targetIntegratedLufs",
  "loudness_tolerance_lufs", "loudnessToleranceLufs",
  "max_true_peak_dbtp", "maxTruePeakDbtp",
  "ffmpeg_path", "ffmpegPath",
  "quality_timeout_ms", "qualityTimeoutMs",
  "version",
]);

const SEMANTIC_POLICY_FIELDS = new Set([
  "required_checks",
  "minimum_confidence",
  "minimum_score",
  "require_audio_review",
  "version",
  "service_id",
  "provider_id",
  "capability",
  "model",
  "max_output_tokens",
  "sample_frame_count",
  "sampleFrameCount",
  "semantic_sampling_timeout_ms",
  "semanticSamplingTimeoutMs",
  "semantic_evidence_bucket",
  "semanticEvidenceBucket",
  "provider_policy",
  "ffmpeg_path",
  "ffmpegPath",
  "max_bytes",
  "maxBytes",
]);

function pick(value = {}, fields = POLICY_FIELDS) {
  return Object.fromEntries(
    Object.entries(value).filter(([key]) => fields.has(key)),
  );
}

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId = body.organization_id || body.organizationId;
    const renderAssetNodeId =
      body.render_asset_node_id || body.renderAssetNodeId;

    if (!organizationId || !renderAssetNodeId) {
      return Response.json(
        {
          success: false,
          error: "organization_id and render_asset_node_id required",
        },
        { status: 400 },
      );
    }

    const access = await requireOrganizationAccess({
      organizationId,
      request,
      requiredPermission: "creative.quality.evaluate",
    });
    if (!access.success) {
      return Response.json(access, { status: access.status });
    }

    const technical = await CreativePerceptualQualityRuntime.analyze({
      organization_id: organizationId,
      render_asset_node_id: renderAssetNodeId,
      policy: pick(body.policy || {}),
      force: body.force === true,
    });

    const semanticPolicy = pick(
      body.semantic_policy || body.semanticPolicy || {},
      SEMANTIC_POLICY_FIELDS,
    );
    const manualReview = body.semantic_review || body.semanticReview || null;
    const allowManualReview = body.allow_manual_semantic_review === true;

    let semantic;
    if (manualReview && allowManualReview) {
      semantic = await CreativeSemanticQualityRuntime.record({
        organization_id: organizationId,
        render_asset_node_id: renderAssetNodeId,
        review: manualReview,
        policy: semanticPolicy,
        force: body.force === true,
      });
    } else {
      semantic = await CreativeAutonomousSemanticReviewRuntime.analyze({
        organization_id: organizationId,
        render_asset_node_id: renderAssetNodeId,
        policy: semanticPolicy,
        provider_id: body.semantic_provider_id || body.semanticProviderId || null,
        force: body.force === true,
      });
    }

    return Response.json({
      success: true,
      technical,
      semantic,
      autonomous_semantic_review: semantic?.autonomous === true,
      passed:
        technical.report?.metadata?.passed === true &&
        semantic.report?.metadata?.passed === true,
      evidence_complete: Boolean(
        semantic?.report?.metadata?.sampled_frames?.length ||
        semantic?.evidence_uri,
      ),
    });
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error.message,
        validation: error.validation || null,
      },
      { status: 500 },
    );
  }
}
