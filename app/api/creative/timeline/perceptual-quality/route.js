export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";
import {
  CreativePerceptualQualityRuntime,
} from "@/lib/creative/quality/runtime/CreativePerceptualQualityRuntime";

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
  "version",
]);

function pick(value = {}) {
  return Object.fromEntries(
    Object.entries(value).filter(([key]) => POLICY_FIELDS.has(key)),
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

    const result = await CreativePerceptualQualityRuntime.analyze({
      organization_id: organizationId,
      render_asset_node_id: renderAssetNodeId,
      policy: pick(body.policy || {}),
      force: body.force === true,
    });

    return Response.json({ success: true, ...result });
  } catch (error) {
    return Response.json(
      { success: false, error: error.message },
      { status: 500 },
    );
  }
}
