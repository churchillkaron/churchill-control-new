import { CreativeMediaDerivativeRuntime } from "@/lib/creative/media/runtime/CreativeMediaDerivativeRuntime";
import { materializeMedia } from "@/lib/creative/media/runtime/CreativeMediaInspectionRuntime";
import { CreativeRenderTechnicalQualityRuntime } from "@/lib/creative/quality/runtime/CreativeRenderTechnicalQualityRuntime";
import { CreativeFfmpegDeliveryPreflightRuntime } from "./CreativeFfmpegDeliveryPreflightRuntime";
import * as AssetGraphRepository from "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository";

const CONTRACT = "AVANTIQO_CERTIFIED_MASTER_DERIVATIVE_V1";

function text(value) {
  return String(value ?? "").trim();
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function aspect(width, height) {
  return width && height ? Number(width) / Number(height) : null;
}

function sameAspect(source, profile) {
  const sourceRatio = aspect(source.width, source.height);
  const targetRatio = aspect(profile.width, profile.height);
  if (!sourceRatio || !targetRatio) return true;
  return Math.abs(sourceRatio - targetRatio) <= 0.002;
}

function assertTransformAuthority(master, profile = {}) {
  const source = object(master.technical);
  const sourceFrameRate = finite(source.frame_rate ?? source.fps);
  const targetFrameRate = finite(profile.frame_rate ?? profile.fps);
  const duration = finite(source.duration_seconds);
  const requestedDuration = finite(profile.duration_seconds ?? profile.duration);

  if (!sameAspect(source, profile)) {
    throw new Error("CERTIFIED_MASTER_DERIVATIVE_CREATIVE_REFRAME_MASTER_REQUIRED");
  }
  if (
    sourceFrameRate &&
    targetFrameRate &&
    Math.abs(sourceFrameRate - targetFrameRate) > 0.001 &&
    profile.frame_rate_conversion_authorized !== true
  ) {
    throw new Error("CERTIFIED_MASTER_DERIVATIVE_FRAME_RATE_CHANGE_NOT_AUTHORIZED");
  }
  if (
    duration &&
    requestedDuration &&
    Math.abs(duration - requestedDuration) > 0.05 &&
    profile.duration_edit_authorized !== true
  ) {
    throw new Error("CERTIFIED_MASTER_DERIVATIVE_DURATION_EDIT_NOT_AUTHORIZED");
  }
  if (
    (profile.color_space || profile.color_transfer || profile.color_primaries) &&
    profile.color_transform_authorized !== true
  ) {
    throw new Error("CERTIFIED_MASTER_DERIVATIVE_COLOR_TRANSFORM_NOT_AUTHORIZED");
  }
  if (text(profile.fit).toLowerCase() === "fill" || text(profile.fit).toLowerCase() === "stretch") {
    throw new Error("CERTIFIED_MASTER_DERIVATIVE_DISTORTION_FORBIDDEN");
  }
}

function derivativeProfile(master, profile = {}, channel = null) {
  const width = finite(profile.width);
  const height = finite(profile.height);
  const sourceWidth = finite(master.technical?.width);
  const sourceHeight = finite(master.technical?.height);
  const scale = width && height && (width !== sourceWidth || height !== sourceHeight)
    ? `${width}:${height}`
    : null;
  return {
    ...profile,
    id: profile.id || profile.name || `certified-master-${channel || "delivery"}`,
    name: profile.name || `${channel || "Delivery"} certified-master derivative`,
    kind: "video",
    engine: "ffmpeg",
    asset_type: "FINAL_RENDER",
    ...(scale ? { scale } : {}),
    tags: [...new Set([...(Array.isArray(profile.tags) ? profile.tags : []), "certified-master-derivative"])],
  };
}

export const CreativeCertifiedMasterDerivativeRuntime = Object.freeze({
  contract: CONTRACT,
  exact_master_bytes_required: true,
  timeline_rerender_allowed: false,
  transform_preflight_required: true,
  provider_calls_executed: 0,

  async create({
    organization_id,
    creative_project_id,
    master_render,
    final_mastering,
    profile,
    channel = null,
    policy = {},
  } = {}) {
    if (!organization_id) throw new Error("organization_id required");
    if (!creative_project_id) throw new Error("creative_project_id required");
    if (!master_render?.id || !master_render?.url) {
      throw new Error("CERTIFIED_MASTER_DERIVATIVE_MASTER_REQUIRED");
    }
    if (text(master_render.organization_id) !== text(organization_id)) {
      throw new Error("CERTIFIED_MASTER_DERIVATIVE_ORGANIZATION_MISMATCH");
    }
    if (text(master_render.creative_project_id) !== text(creative_project_id)) {
      throw new Error("CERTIFIED_MASTER_DERIVATIVE_PROJECT_MISMATCH");
    }
    const seal = object(final_mastering?.seal || final_mastering?.report?.metadata?.final_mastering_seal);
    const sealedChecksum = text(
      seal.master_checksum || final_mastering?.report?.metadata?.master_checksum,
    );
    const storedChecksum = text(master_render.technical?.checksum);
    if (
      final_mastering?.passed !== true ||
      !text(final_mastering?.report?.id) ||
      !text(seal.seal_hash) ||
      !sealedChecksum ||
      sealedChecksum !== storedChecksum
    ) {
      throw new Error("CERTIFIED_MASTER_DERIVATIVE_VALID_MASTER_SEAL_REQUIRED");
    }

    assertTransformAuthority(master_render, profile);
    const resolvedProfile = derivativeProfile(master_render, profile, channel);
    const ffmpegPreflight = await CreativeFfmpegDeliveryPreflightRuntime.assert({
      profile: resolvedProfile,
      policy,
    });

    const materialized = await materializeMedia({
      url: master_render.url,
      file_name: master_render.name || null,
      mime_type: master_render.technical?.mime_type || null,
      organization_id,
      policy,
    });
    try {
      if (text(materialized.checksum) !== sealedChecksum) {
        throw new Error("CERTIFIED_MASTER_BYTE_CHECKSUM_MISMATCH");
      }
    } finally {
      await materialized.cleanup();
    }

    const [created] = await CreativeMediaDerivativeRuntime.create({
      organization_id,
      parent_asset_node_id: master_render.id,
      profiles: [resolvedProfile],
      policy,
    });
    if (!created?.id) throw new Error("CERTIFIED_MASTER_DERIVATIVE_OUTPUT_REQUIRED");

    const outputChecksum = text(created.technical?.checksum);
    if (!outputChecksum) {
      throw new Error("CERTIFIED_MASTER_DERIVATIVE_OUTPUT_CHECKSUM_REQUIRED");
    }

    const technicalQc = CreativeRenderTechnicalQualityRuntime.evaluate({
      technical: created.technical || {},
      profile,
      expected_duration_seconds:
        profile.duration_seconds || master_render.technical?.duration_seconds || null,
      audio_expected: Boolean(
        master_render.technical?.audio_codec ||
        master_render.metadata?.master_soundtrack_asset_node_id ||
        master_render.metadata?.master_soundtrack_contract_hash
      ),
    });
    const render = await AssetGraphRepository.update(created.id, {
      status: technicalQc.passed ? "REVIEW" : "REJECTED",
      metadata: {
        ...object(created.metadata),
        contract: CONTRACT,
        release_derivative: true,
        release_derivative_channel: channel,
        release_derivative_profile_id: text(profile?.id || profile?.name) || null,
        source_final_master_asset_node_id: master_render.id,
        source_final_master_checksum: sealedChecksum,
        source_final_master_actual_byte_checksum: sealedChecksum,
        source_final_mastering_report_id: final_mastering.report.id,
        source_final_mastering_seal_hash: seal.seal_hash,
        source_master_bytes_verified: true,
        derivative_output_checksum: outputChecksum,
        derivative_created_from_certified_master: true,
        derivative_created_from_timeline_rerender: false,
        transform_authority_verified: true,
        ffmpeg_delivery_preflight_contract: ffmpegPreflight.contract,
        ffmpeg_delivery_preflight_passed: ffmpegPreflight.passed === true,
        technical_qc: technicalQc,
        publication_authorized: false,
      },
    });

    return {
      contract: CONTRACT,
      render,
      technical_qc: technicalQc,
      ffmpeg_preflight: ffmpegPreflight,
      source_master_bytes_verified: true,
      source_final_master_checksum: sealedChecksum,
      derivative_output_checksum: outputChecksum,
      passed: technicalQc.passed && ffmpegPreflight.passed === true,
      provider_calls_executed: 0,
    };
  },
});
