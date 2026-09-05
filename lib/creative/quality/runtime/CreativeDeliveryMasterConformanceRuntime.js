import crypto from "node:crypto";
import { spawn } from "node:child_process";

import {
  createCreativeAssetNode,
  CREATIVE_ASSET_NODE_STATUS,
  CREATIVE_ASSET_NODE_TYPES,
} from "@/lib/creative/assets/graph/documents/CreativeAssetNode";
import * as AssetGraphRepository
from "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository";
import {
  materializeMedia,
} from "@/lib/creative/media/runtime/CreativeMediaInspectionRuntime";
import {
  resolveCreativeFfprobePath,
} from "@/lib/creative/media/runtime/CreativeMediaBinaryRuntime";

const CONTRACT = "CREATIVE_DELIVERY_MASTER_CONFORMANCE_V1";

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value.filter((item) => item !== null && item !== undefined) : [];
}

function text(value) {
  return String(value ?? "").trim();
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function boolean(value) {
  if (typeof value === "boolean") return value;
  const normalized = text(value).toLowerCase();
  if (["true", "yes", "required", "on", "1"].includes(normalized)) return true;
  if (["false", "no", "optional", "off", "0"].includes(normalized)) return false;
  return null;
}

function fraction(value) {
  const source = text(value);
  if (!source) return null;
  const [numerator, denominator] = source.split("/").map(Number);
  if (!Number.isFinite(numerator)) return null;
  if (!Number.isFinite(denominator) || denominator === 0) return numerator;
  return numerator / denominator;
}

function normalizeCodec(value) {
  const codec = text(value).toLowerCase();
  const aliases = {
    avc1: "h264",
    libx264: "h264",
    h264_nvenc: "h264",
    h264_videotoolbox: "h264",
    h265: "hevc",
    libx265: "hevc",
    hevc_nvenc: "hevc",
    hevc_videotoolbox: "hevc",
    prores_ks: "prores",
    prores_aw: "prores",
    libvpx_vp9: "vp9",
    "libvpx-vp9": "vp9",
    libaom_av1: "av1",
    libsvtav1: "av1",
    aac_at: "aac",
    libfdk_aac: "aac",
    libopus: "opus",
  };
  return aliases[codec] || codec || null;
}

function values(...candidates) {
  for (const candidate of candidates) {
    if (Array.isArray(candidate) && candidate.length) {
      return candidate.map((item) => text(item).toLowerCase()).filter(Boolean);
    }
    if (candidate !== null && candidate !== undefined && text(candidate)) {
      return [text(candidate).toLowerCase()];
    }
  }
  return [];
}

function firstNumber(...candidates) {
  for (const candidate of candidates) {
    const number = finite(candidate);
    if (number !== null) return number;
  }
  return null;
}

function firstText(...candidates) {
  for (const candidate of candidates) {
    const value = text(candidate);
    if (value) return value;
  }
  return null;
}

function bitrateBps(source = {}, name) {
  const snake = source[`${name}_bps`];
  const camel = source[`${name}Bps`];
  const kbps = source[`${name}_kbps`] ?? source[`${name}Kbps`];
  const mbps = source[`${name}_mbps`] ?? source[`${name}Mbps`];
  const direct = firstNumber(snake, camel);
  if (direct !== null) return direct;
  const kilo = finite(kbps);
  if (kilo !== null) return kilo * 1000;
  const mega = finite(mbps);
  if (mega !== null) return mega * 1000000;
  return null;
}

function normalizedLanguage(value) {
  return text(value).toLowerCase().replace(/_/g, "-");
}

function requirementPolicy(profile = {}) {
  const delivery = {
    ...object(profile.delivery_conformance),
    ...object(profile.deliveryConformance),
    ...object(profile.master_conformance),
    ...object(profile.masterConformance),
  };
  const video = {
    ...object(profile.video),
    ...object(delivery.video),
  };
  const audio = {
    ...object(profile.audio_quality),
    ...object(profile.audioQuality),
    ...object(profile.audio_delivery),
    ...object(profile.audioDelivery),
    ...object(delivery.audio),
  };
  const subtitles = {
    ...object(profile.subtitles),
    ...object(profile.subtitle_delivery),
    ...object(profile.subtitleDelivery),
    ...object(delivery.subtitles),
  };
  const required = boolean(
    delivery.required ??
    profile.strict_delivery_conformance ??
    profile.strictDeliveryConformance ??
    profile.strict_delivery_qc ??
    profile.strictDeliveryQc,
  ) === true;

  const container = values(
    delivery.containers,
    delivery.container,
    profile.allowed_containers,
    profile.allowedContainers,
    profile.container,
    profile.format,
  );
  const videoCodecs = values(
    video.codecs,
    video.codec,
    delivery.video_codecs,
    delivery.videoCodecs,
    profile.allowed_video_codecs,
    profile.allowedVideoCodecs,
    profile.expected_video_codec,
    profile.expectedVideoCodec,
    profile.video_codec,
    profile.videoCodec,
  ).map(normalizeCodec).filter(Boolean);
  const pixelFormats = values(
    video.pixel_formats,
    video.pixelFormats,
    video.pixel_format,
    video.pixelFormat,
    delivery.pixel_formats,
    delivery.pixelFormats,
    profile.pixel_format,
    profile.pixelFormat,
  );
  const colorPrimaries = values(
    video.color_primaries,
    video.colorPrimaries,
    delivery.color_primaries,
    delivery.colorPrimaries,
    profile.color_primaries,
    profile.colorPrimaries,
  );
  const colorTransfer = values(
    video.color_transfer,
    video.colorTransfer,
    video.transfer_characteristics,
    video.transferCharacteristics,
    delivery.color_transfer,
    delivery.colorTransfer,
    profile.color_transfer,
    profile.colorTransfer,
  );
  const colorSpace = values(
    video.color_space,
    video.colorSpace,
    video.color_matrix,
    video.colorMatrix,
    delivery.color_space,
    delivery.colorSpace,
    profile.color_space,
    profile.colorSpace,
  );
  const audioCodecs = values(
    audio.codecs,
    audio.codec,
    delivery.audio_codecs,
    delivery.audioCodecs,
    profile.allowed_audio_codecs,
    profile.allowedAudioCodecs,
    profile.expected_audio_codec,
    profile.expectedAudioCodec,
    profile.audio_codec,
    profile.audioCodec,
  ).map(normalizeCodec).filter(Boolean);
  const channelLayouts = values(
    audio.channel_layouts,
    audio.channelLayouts,
    audio.channel_layout,
    audio.channelLayout,
    delivery.audio_channel_layouts,
    delivery.audioChannelLayouts,
    profile.channel_layout,
    profile.channelLayout,
  );
  const subtitleCodecs = values(
    subtitles.codecs,
    subtitles.codec,
    delivery.subtitle_codecs,
    delivery.subtitleCodecs,
    profile.subtitle_codecs,
    profile.subtitleCodecs,
  ).map(normalizeCodec).filter(Boolean);
  const subtitleLanguages = values(
    subtitles.languages,
    delivery.subtitle_languages,
    delivery.subtitleLanguages,
    profile.subtitle_languages,
    profile.subtitleLanguages,
  ).map(normalizedLanguage);
  const subtitleMode = firstText(
    subtitles.mode,
    delivery.subtitle_mode,
    delivery.subtitleMode,
    profile.subtitle_mode,
    profile.subtitleMode,
  )?.toLowerCase() || null;

  const policy = {
    contract: CONTRACT,
    required,
    profile_id: firstText(profile.id, profile.name),
    container,
    video_codecs: videoCodecs,
    width: firstNumber(video.width, delivery.width, profile.width),
    height: firstNumber(video.height, delivery.height, profile.height),
    frame_rate: firstNumber(
      video.frame_rate,
      video.frameRate,
      video.fps,
      delivery.frame_rate,
      delivery.frameRate,
      delivery.fps,
      profile.frame_rate,
      profile.frameRate,
      profile.fps,
    ),
    frame_rate_tolerance: firstNumber(
      video.frame_rate_tolerance,
      video.frameRateTolerance,
      delivery.frame_rate_tolerance,
      delivery.frameRateTolerance,
      profile.frame_rate_tolerance,
      profile.frameRateTolerance,
      0.01,
    ),
    minimum_video_bitrate_bps:
      bitrateBps(video, "minimum_video_bitrate") ??
      bitrateBps(delivery, "minimum_video_bitrate"),
    maximum_video_bitrate_bps:
      bitrateBps(video, "maximum_video_bitrate") ??
      bitrateBps(delivery, "maximum_video_bitrate"),
    pixel_formats: pixelFormats,
    color_primaries: colorPrimaries,
    color_transfer: colorTransfer,
    color_space: colorSpace,
    progressive_required: boolean(
      video.progressive_required ??
      video.progressiveRequired ??
      delivery.progressive_required ??
      delivery.progressiveRequired ??
      profile.progressive_required ??
      profile.progressiveRequired,
    ),
    audio_required: boolean(
      audio.required ??
      delivery.audio_required ??
      delivery.audioRequired ??
      profile.audio_required ??
      profile.audioRequired ??
      profile.require_audio ??
      profile.requireAudio,
    ),
    audio_codecs: audioCodecs,
    audio_sample_rate: firstNumber(
      audio.sample_rate,
      audio.sampleRate,
      delivery.audio_sample_rate,
      delivery.audioSampleRate,
      profile.audio_sample_rate,
      profile.audioSampleRate,
      profile.sample_rate,
      profile.sampleRate,
    ),
    audio_channels: firstNumber(
      audio.channels,
      delivery.audio_channels,
      delivery.audioChannels,
      profile.audio_channels,
      profile.audioChannels,
      profile.channels,
    ),
    audio_channel_layouts: channelLayouts,
    subtitle_mode: subtitleMode,
    subtitle_required: boolean(
      subtitles.required ??
      delivery.subtitle_required ??
      delivery.subtitleRequired ??
      profile.subtitle_required ??
      profile.subtitleRequired,
    ),
    minimum_subtitle_tracks: firstNumber(
      subtitles.minimum_tracks,
      subtitles.minimumTracks,
      delivery.minimum_subtitle_tracks,
      delivery.minimumSubtitleTracks,
      profile.minimum_subtitle_tracks,
      profile.minimumSubtitleTracks,
    ),
    subtitle_codecs: subtitleCodecs,
    subtitle_languages: subtitleLanguages,
  };

  const missing = [];
  if (required) {
    if (!policy.container.length) missing.push("container");
    if (!policy.video_codecs.length) missing.push("video_codecs");
    if (policy.width === null || policy.height === null) missing.push("dimensions");
    if (policy.frame_rate === null) missing.push("frame_rate");
    if (!policy.pixel_formats.length) missing.push("pixel_formats");
    if (!policy.color_primaries.length) missing.push("color_primaries");
    if (!policy.color_transfer.length) missing.push("color_transfer");
    if (!policy.color_space.length) missing.push("color_space");
    if (policy.progressive_required === null) missing.push("progressive_required");
    if (policy.audio_required === null) missing.push("audio_required");
    if (policy.audio_required === true) {
      if (!policy.audio_codecs.length) missing.push("audio_codecs");
      if (policy.audio_sample_rate === null) missing.push("audio_sample_rate");
      if (policy.audio_channels === null && !policy.audio_channel_layouts.length) {
        missing.push("audio_channels_or_layout");
      }
    }
    if (policy.subtitle_required === true && policy.subtitle_mode === "embedded") {
      if ((policy.minimum_subtitle_tracks ?? 0) < 1) policy.minimum_subtitle_tracks = 1;
    }
  }

  const identityPayload = { ...policy, missing_requirements: missing };
  return {
    ...identityPayload,
    complete: !required || missing.length === 0,
    identity: crypto.createHash("sha256")
      .update(JSON.stringify(identityPayload))
      .digest("hex"),
  };
}

function runJson(command, args, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout = [];
    const stderr = [];
    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(value);
    };
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish(new Error("DELIVERY_MASTER_QC_TIMEOUT"));
    }, timeoutMs);
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", (error) => finish(error));
    child.on("close", (code) => {
      if (code !== 0) {
        finish(new Error(
          Buffer.concat(stderr).toString("utf8").slice(-12000) ||
          `DELIVERY_MASTER_QC_EXIT_${code}`,
        ));
        return;
      }
      try {
        finish(null, JSON.parse(Buffer.concat(stdout).toString("utf8")));
      } catch {
        finish(new Error("DELIVERY_MASTER_QC_INVALID_PROBE_JSON"));
      }
    });
  });
}

function streamSummary(stream = {}) {
  return {
    index: finite(stream.index),
    codec_type: text(stream.codec_type).toLowerCase() || null,
    codec_name: normalizeCodec(stream.codec_name),
    profile: text(stream.profile) || null,
    width: finite(stream.width),
    height: finite(stream.height),
    frame_rate: fraction(stream.avg_frame_rate || stream.r_frame_rate),
    pixel_format: text(stream.pix_fmt).toLowerCase() || null,
    color_range: text(stream.color_range).toLowerCase() || null,
    color_space: text(stream.color_space).toLowerCase() || null,
    color_transfer: text(stream.color_transfer).toLowerCase() || null,
    color_primaries: text(stream.color_primaries).toLowerCase() || null,
    field_order: text(stream.field_order).toLowerCase() || null,
    bitrate_bps: finite(stream.bit_rate),
    sample_rate: finite(stream.sample_rate),
    channels: finite(stream.channels),
    channel_layout: text(stream.channel_layout).toLowerCase() || null,
    language: normalizedLanguage(stream.tags?.language) || null,
  };
}

function probeSummary(probe = {}) {
  const streams = list(probe.streams).map(streamSummary);
  const formatNames = text(probe.format?.format_name)
    .toLowerCase()
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return {
    format_names: formatNames,
    format_long_name: text(probe.format?.format_long_name) || null,
    total_bitrate_bps: finite(probe.format?.bit_rate),
    duration_seconds: finite(probe.format?.duration),
    video: streams.find((stream) => stream.codec_type === "video") || null,
    audio: streams.filter((stream) => stream.codec_type === "audio"),
    subtitles: streams.filter((stream) => stream.codec_type === "subtitle"),
    streams,
  };
}

function evaluate(actual, policy) {
  const checks = [];
  const add = (id, passed, actualValue, expected) => {
    checks.push({ id, passed: Boolean(passed), actual: actualValue, expected });
  };
  const video = actual.video || {};
  const primaryAudio = actual.audio[0] || {};

  add(
    "container",
    policy.container.some((expected) => actual.format_names.includes(expected)),
    actual.format_names,
    policy.container,
  );
  add(
    "video_codec",
    policy.video_codecs.includes(normalizeCodec(video.codec_name)),
    video.codec_name || null,
    policy.video_codecs,
  );
  add(
    "dimensions",
    video.width === policy.width && video.height === policy.height,
    { width: video.width ?? null, height: video.height ?? null },
    { width: policy.width, height: policy.height },
  );
  add(
    "frame_rate",
    video.frame_rate !== null && video.frame_rate !== undefined &&
      Math.abs(video.frame_rate - policy.frame_rate) <= policy.frame_rate_tolerance,
    video.frame_rate ?? null,
    { value: policy.frame_rate, tolerance: policy.frame_rate_tolerance },
  );
  add(
    "pixel_format",
    policy.pixel_formats.includes(text(video.pixel_format).toLowerCase()),
    video.pixel_format || null,
    policy.pixel_formats,
  );
  add(
    "color_primaries",
    policy.color_primaries.includes(text(video.color_primaries).toLowerCase()),
    video.color_primaries || null,
    policy.color_primaries,
  );
  add(
    "color_transfer",
    policy.color_transfer.includes(text(video.color_transfer).toLowerCase()),
    video.color_transfer || null,
    policy.color_transfer,
  );
  add(
    "color_space",
    policy.color_space.includes(text(video.color_space).toLowerCase()),
    video.color_space || null,
    policy.color_space,
  );

  if (policy.progressive_required === true) {
    add(
      "progressive_scan",
      video.field_order === "progressive",
      video.field_order || null,
      "progressive",
    );
  }
  if (policy.progressive_required === false) {
    add(
      "interlaced_scan",
      Boolean(video.field_order && !["progressive", "unknown"].includes(video.field_order)),
      video.field_order || null,
      "interlaced",
    );
  }
  if (policy.minimum_video_bitrate_bps !== null) {
    add(
      "minimum_video_bitrate",
      video.bitrate_bps !== null && video.bitrate_bps >= policy.minimum_video_bitrate_bps,
      video.bitrate_bps ?? null,
      { minimum_bps: policy.minimum_video_bitrate_bps },
    );
  }
  if (policy.maximum_video_bitrate_bps !== null) {
    add(
      "maximum_video_bitrate",
      video.bitrate_bps !== null && video.bitrate_bps <= policy.maximum_video_bitrate_bps,
      video.bitrate_bps ?? null,
      { maximum_bps: policy.maximum_video_bitrate_bps },
    );
  }

  if (policy.audio_required === true) {
    add("audio_stream", actual.audio.length > 0, actual.audio.length, ">= 1");
    add(
      "audio_codec",
      policy.audio_codecs.includes(normalizeCodec(primaryAudio.codec_name)),
      primaryAudio.codec_name || null,
      policy.audio_codecs,
    );
    add(
      "audio_sample_rate",
      primaryAudio.sample_rate === policy.audio_sample_rate,
      primaryAudio.sample_rate ?? null,
      policy.audio_sample_rate,
    );
    if (policy.audio_channels !== null) {
      add(
        "audio_channels",
        primaryAudio.channels === policy.audio_channels,
        primaryAudio.channels ?? null,
        policy.audio_channels,
      );
    }
    if (policy.audio_channel_layouts.length) {
      add(
        "audio_channel_layout",
        policy.audio_channel_layouts.includes(text(primaryAudio.channel_layout).toLowerCase()),
        primaryAudio.channel_layout || null,
        policy.audio_channel_layouts,
      );
    }
  }
  if (policy.audio_required === false) {
    add("audio_absent", actual.audio.length === 0, actual.audio.length, 0);
  }

  if (policy.subtitle_required === true && policy.subtitle_mode === "embedded") {
    const minimum = Math.max(1, policy.minimum_subtitle_tracks || 1);
    add("embedded_subtitle_count", actual.subtitles.length >= minimum, actual.subtitles.length, { minimum });
    if (policy.subtitle_codecs.length) {
      add(
        "embedded_subtitle_codec",
        actual.subtitles.every((stream) => policy.subtitle_codecs.includes(normalizeCodec(stream.codec_name))),
        actual.subtitles.map((stream) => stream.codec_name),
        policy.subtitle_codecs,
      );
    }
    for (const language of policy.subtitle_languages) {
      add(
        `subtitle_language_${language}`,
        actual.subtitles.some((stream) => normalizedLanguage(stream.language) === language),
        actual.subtitles.map((stream) => stream.language).filter(Boolean),
        language,
      );
    }
  }

  return {
    passed: checks.length > 0 && checks.every((check) => check.passed),
    checks,
    failed_checks: checks.filter((check) => !check.passed).map((check) => check.id),
  };
}

function reportIdentity(render, policy) {
  return crypto.createHash("sha256").update(JSON.stringify({
    render_asset_node_id: render.id,
    render_identity: render.metadata?.render_identity || null,
    checksum: render.technical?.checksum || null,
    policy_identity: policy.identity,
  })).digest("hex");
}

function compactReport(node) {
  if (!node) return null;
  return {
    id: node.id,
    status: node.status,
    passed: node.metadata?.passed === true,
    actual: node.metadata?.actual || null,
    checks: list(node.metadata?.checks),
    failed_checks: list(node.metadata?.failed_checks),
    evaluated_at: node.metadata?.evaluated_at || node.created_at || null,
  };
}

export const CreativeDeliveryMasterConformanceRuntime = Object.freeze({
  contract: CONTRACT,

  resolvePolicy(profile = {}) {
    return requirementPolicy(profile);
  },

  async inspect({ organization_id, render_asset_node_id } = {}) {
    if (!organization_id) throw new Error("organization_id required");
    if (!render_asset_node_id) throw new Error("render_asset_node_id required");
    const render = await AssetGraphRepository.getById(render_asset_node_id);
    if (
      !render ||
      String(render.organization_id) !== String(organization_id) ||
      render.type !== CREATIVE_ASSET_NODE_TYPES.FINAL_RENDER
    ) {
      throw new Error("Final render asset not found");
    }

    const policy = requirementPolicy(render.metadata?.export_profile || {});
    const identity = reportIdentity(render, policy);
    const nodes = await AssetGraphRepository.listByProject({
      organization_id,
      creative_project_id: render.creative_project_id,
    });
    const report = nodes
      .filter((node) =>
        node.type === CREATIVE_ASSET_NODE_TYPES.QUALITY_REPORT &&
        node.parent_asset_node_id === render.id &&
        node.metadata?.delivery_master_conformance_identity === identity,
      )
      .sort((left, right) =>
        Date.parse(right.updated_at || right.created_at || 0) -
        Date.parse(left.updated_at || left.created_at || 0),
      )[0] || null;

    return {
      contract: CONTRACT,
      render_asset_node_id: render.id,
      policy,
      required: policy.required,
      report: compactReport(report),
      passed: !policy.required || report?.metadata?.passed === true,
      can_analyze: Boolean(policy.required && policy.complete && render.url),
      blocker: !policy.required
        ? null
        : !policy.complete
          ? "DELIVERY_MASTER_POLICY_INCOMPLETE"
          : report?.metadata?.passed === true
            ? null
            : "DELIVERY_MASTER_CONFORMANCE_REQUIRED",
    };
  },

  async analyze({ organization_id, render_asset_node_id, force = false } = {}) {
    if (!organization_id) throw new Error("organization_id required");
    if (!render_asset_node_id) throw new Error("render_asset_node_id required");
    const render = await AssetGraphRepository.getById(render_asset_node_id);
    if (
      !render ||
      String(render.organization_id) !== String(organization_id) ||
      render.type !== CREATIVE_ASSET_NODE_TYPES.FINAL_RENDER
    ) {
      throw new Error("Final render asset not found");
    }
    if (!render.url) throw new Error("FINAL_RENDER_MEDIA_REQUIRED");

    const policy = requirementPolicy(render.metadata?.export_profile || {});
    if (!policy.required) return { skipped: true, reason: "DELIVERY_MASTER_CONFORMANCE_NOT_REQUIRED", policy };
    if (!policy.complete) {
      throw new Error(`DELIVERY_MASTER_POLICY_INCOMPLETE:${policy.missing_requirements.join(",")}`);
    }
    if (!force) {
      const existing = await this.inspect({ organization_id, render_asset_node_id });
      if (existing.report) return { report: existing.report, reused: true, policy };
    }

    const ffprobePath = resolveCreativeFfprobePath();
    if (!ffprobePath) throw new Error("FFPROBE_NOT_CONFIGURED_FOR_DELIVERY_MASTER_QC");
    const materialized = await materializeMedia({
      url: render.url,
      file_name: render.name || "final-render",
      mime_type: render.technical?.mime_type || null,
      organization_id,
    });

    try {
      const probe = await runJson(ffprobePath, [
        "-v", "error",
        "-show_format",
        "-show_streams",
        "-of", "json",
        materialized.file_path,
      ]);
      const actual = probeSummary(probe);
      const evaluation = evaluate(actual, policy);
      const identity = reportIdentity(render, policy);
      const node = createCreativeAssetNode({
        organization_id,
        creative_project_id: render.creative_project_id,
        parent_asset_node_id: render.id,
        type: CREATIVE_ASSET_NODE_TYPES.QUALITY_REPORT,
        status: evaluation.passed
          ? CREATIVE_ASSET_NODE_STATUS.REVIEW
          : CREATIVE_ASSET_NODE_STATUS.REJECTED,
        name: `${render.name || "Final render"} delivery master conformance`,
        description: "Export-profile container, video, colour, audio and embedded subtitle conformance evidence.",
        lineage: {
          source: "delivery_master_conformance",
          capability: "creative.render.quality.delivery-master",
          generation_version: 1,
        },
        intelligence: {
          safety_status: "UNKNOWN",
          tags: ["delivery-master-qc", "export-profile", "ffprobe"],
        },
        reuse: { reusable: false, approved_for_reuse: false },
        review: { ai_reviewed: true, human_reviewed: false, approved: false },
        metadata: {
          delivery_master_conformance_identity: identity,
          render_asset_node_id: render.id,
          render_identity: render.metadata?.render_identity || null,
          render_checksum: render.technical?.checksum || null,
          policy_identity: policy.identity,
          profile_id: policy.profile_id,
          policy,
          actual,
          ...evaluation,
          method: "FFPROBE_EXACT_MASTER_PROFILE_CONFORMANCE",
          evaluated_at: new Date().toISOString(),
        },
      });
      const report = await AssetGraphRepository.create(node);
      await AssetGraphRepository.update(render.id, {
        metadata: {
          ...(render.metadata || {}),
          delivery_master_conformance_required: true,
          delivery_master_conformance_passed: evaluation.passed,
          delivery_master_conformance_policy_identity: policy.identity,
          delivery_master_conformance_report_asset_node_id: report.id,
          delivery_master_conformance_evaluated_at:
            report.metadata?.evaluated_at || new Date().toISOString(),
        },
      });

      return { report: compactReport(report), reused: false, policy };
    } finally {
      await materialized.cleanup();
    }
  },
});

export const CREATIVE_DELIVERY_MASTER_CONFORMANCE_CONTRACT = CONTRACT;
