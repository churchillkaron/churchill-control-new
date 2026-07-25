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

function configured(policy, ...keys) {
  return keys.some((key) => {
    const value = policy[key];
    return value !== null && value !== undefined && value !== "";
  });
}

function validatePolicy(policy) {
  const checks = [];

  if (configured(policy, "max_black_duration_seconds", "maxBlackDurationSeconds")) {
    if (!configured(policy, "black_picture_threshold", "blackPictureThreshold") ||
        !configured(policy, "black_pixel_threshold", "blackPixelThreshold")) {
      throw new Error("BLACK_QC_THRESHOLDS_REQUIRED");
    }
    checks.push("black_duration");
  }

  if (configured(policy, "max_freeze_duration_seconds", "maxFreezeDurationSeconds")) {
    if (!configured(policy, "freeze_noise", "freezeNoise")) {
      throw new Error("FREEZE_QC_NOISE_REQUIRED");
    }
    checks.push("freeze_duration");
  }

  if (configured(policy, "max_silence_duration_seconds", "maxSilenceDurationSeconds")) {
    if (!configured(policy, "silence_noise_db", "silenceNoiseDb")) {
      throw new Error("SILENCE_QC_NOISE_REQUIRED");
    }
    checks.push("silence_duration");
  }

  const loudnessConfigured = configured(
    policy,
    "target_integrated_lufs",
    "targetIntegratedLufs",
  );
  const loudnessToleranceConfigured = configured(
    policy,
    "loudness_tolerance_lufs",
    "loudnessToleranceLufs",
  );
  if (loudnessConfigured || loudnessToleranceConfigured) {
    if (!loudnessConfigured || !loudnessToleranceConfigured) {
      throw new Error("LOUDNESS_TARGET_AND_TOLERANCE_REQUIRED");
    }
    checks.push("integrated_loudness");
  }

  if (configured(policy, "max_true_peak_dbtp", "maxTruePeakDbtp")) {
    checks.push("true_peak");
  }

  if (!checks.length) throw new Error("PERCEPTUAL_QC_ENFORCEABLE_CHECK_REQUIRED");
  return checks;
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

    const policy = pick(body.policy || {});
    const enforcedChecks = validatePolicy(policy);
    const result = await CreativePerceptualQualityRuntime.analyze({
      organization_id: organizationId,
      render_asset_node_id: renderAssetNodeId,
      policy,
      force: body.force === true,
    });

    return Response.json({
      success: true,
      enforced_checks: enforcedChecks,
      ...result,
    });
  } catch (error) {
    return Response.json(
      { success: false, error: error.message },
      { status: 500 },
    );
  }
}
