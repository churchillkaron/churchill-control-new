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

    let semantic = null;
    if (body.semantic_review) {
      semantic = await CreativeSemanticQualityRuntime.record({
        organization_id: organizationId,
        render_asset_node_id: renderAssetNodeId,
        review: body.semantic_review,
        policy: pick(
          body.semantic_policy || {},
          SEMANTIC_POLICY_FIELDS,
        ),
        force: body.force === true,
      });
    }

    return Response.json({
      success: true,
      technical,
      semantic,
      passed:
        technical.report?.metadata?.passed === true &&
        (!semantic || semantic.report?.metadata?.passed === true),
      evidence_complete: Boolean(semantic),
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
