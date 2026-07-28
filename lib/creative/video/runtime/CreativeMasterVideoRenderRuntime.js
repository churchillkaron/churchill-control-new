import crypto from "node:crypto";

import {
  CreativeProjectRuntime,
} from "@/lib/creative/projects/runtime/CreativeProjectRuntime";
import {
  CreativeEdlRenderRuntime,
} from "@/lib/creative/post-production/runtime/CreativeEdlRenderRuntime";
import {
  createCreativeAssetNode,
  CREATIVE_ASSET_NODE_STATUS,
  CREATIVE_ASSET_NODE_TYPES,
} from "@/lib/creative/assets/graph/documents/CreativeAssetNode";
import * as AssetGraphRepository
from "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository";

const SOURCE_ONLY_MODE = "SOURCE_ONLY_FFMPEG";
const ACCEPTANCE_COMMAND = "MISSION_ACCEPTED";
const RUNTIME_VERSION = "creative-master-video-source-only-v2";

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function hash(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function authorize(authorization = {}) {
  const command = text(
    authorization.command || authorization.acceptance_command,
  ).toUpperCase();
  const mode = text(
    authorization.production_mode || authorization.productionMode,
  ).toUpperCase();
  const providersDisabled =
    authorization.allow_provider_calls === false ||
    authorization.allowProviderCalls === false;

  if (authorization.approved !== true || command !== ACCEPTANCE_COMMAND) {
    throw new Error("MISSION_ACCEPTED_REQUIRED");
  }
  if (mode !== SOURCE_ONLY_MODE) {
    throw new Error("SOURCE_ONLY_FFMPEG_REQUIRED");
  }
  if (!providersDisabled) {
    throw new Error("MASTER_VIDEO_PROVIDER_CALLS_MUST_BE_DISABLED");
  }

  return {
    approved: true,
    command,
    production_mode: mode,
    allow_provider_calls: false,
  };
}

function duration(moment) {
  return finite(
    moment?.metadata?.clip_range?.duration_seconds ??
    moment?.technical?.duration_seconds,
    0,
  );
}

function originalSourceId(moment) {
  return text(moment?.metadata?.source_asset_node_id) ||
    text(moment?.metadata?.original_source_asset_node_id) ||
    text(moment?.metadata?.performance_evidence?.source_asset_node_id) ||
    null;
}

function verifiedMoments(nodes) {
  return nodes
    .filter((node) =>
      node.type === CREATIVE_ASSET_NODE_TYPES.MOMENT &&
      node.status !== CREATIVE_ASSET_NODE_STATUS.ARCHIVED &&
      node.metadata?.performance_verified === true &&
      node.metadata?.blocked !== true &&
      node.metadata?.original_audio_preserved === true &&
      text(node.url) &&
      duration(node) > 0,
    )
    .sort((left, right) => {
      const leftScore = finite(
        left.metadata?.score ?? left.intelligence?.reuse_score,
        0,
      );
      const rightScore = finite(
        right.metadata?.score ?? right.intelligence?.reuse_score,
        0,
      );
      return rightScore - leftScore;
    });
}

function findLogo(nodes) {
  return nodes.find((node) =>
    node.type === CREATIVE_ASSET_NODE_TYPES.LOGO &&
    node.status !== CREATIVE_ASSET_NODE_STATUS.ARCHIVED &&
    text(node.url),
  ) || nodes.find((node) =>
    node.type === CREATIVE_ASSET_NODE_TYPES.IMAGE &&
    node.status !== CREATIVE_ASSET_NODE_STATUS.ARCHIVED &&
    text(node.url) &&
    /cole[-_ ]?logo/i.test(
      `${node.name || ""} ${node.metadata?.original_file_name || ""}`,
    ),
  ) || null;
}

function buildSelection(moments, targetDuration, maximumPerSource) {
  const counts = new Map();
  const preferred = [];
  const overflow = [];

  for (const moment of moments) {
    const sourceId = originalSourceId(moment) || moment.id;
    const count = counts.get(sourceId) || 0;
    if (count < maximumPerSource) {
      preferred.push(moment);
      counts.set(sourceId, count + 1);
    } else {
      overflow.push(moment);
    }
  }

  const entries = [];
  let cursor = 0;
  for (const moment of [...preferred, ...overflow]) {
    if (cursor >= targetDuration - 0.001) break;
    const clipDuration = Math.min(duration(moment), targetDuration - cursor);
    if (clipDuration <= 0) continue;

    entries.push({
      index: entries.length + 1,
      source_asset_node_id: originalSourceId(moment),
      source_clip_node_id:
        moment.metadata?.source_clip_node_id || moment.parent_asset_node_id || null,
      source_moment_node_id: moment.id,
      source_url: moment.url,
      source_in_seconds: 0,
      source_out_seconds: clipDuration,
      timeline_in_seconds: cursor,
      timeline_out_seconds: cursor + clipDuration,
      duration_seconds: clipDuration,
      selection_score: finite(
        moment.metadata?.score ?? moment.intelligence?.reuse_score,
        0,
      ),
      performance_verified: true,
      original_audio_preserved: true,
      exact_lip_sync_required: true,
      original_source_range: moment.metadata?.original_source_range || null,
      reframe_plan: moment.metadata?.reframe_plan || null,
    });
    cursor += clipDuration;
  }

  return {
    entries,
    duration_seconds: Number(cursor.toFixed(6)),
    distinct_source_count: new Set(
      entries.map((entry) => entry.source_asset_node_id).filter(Boolean),
    ).size,
  };
}

function exportProfile(policy, targetDuration) {
  return {
    id: "landscape-master-1080p-source-only",
    name: "Cole Ley 3-minute landscape master",
    description:
      "Source-only FFmpeg master preserving original live audio and lip sync.",
    extension: "mp4",
    container: "mp4",
    mime_type: "video/mp4",
    width: finite(policy.output_width ?? policy.outputWidth, 1920),
    height: finite(policy.output_height ?? policy.outputHeight, 1080),
    frame_rate: finite(policy.frame_rate ?? policy.frameRate, 30),
    fit: text(policy.fit) || "cover",
    background: text(policy.background) || "black",
    video_codec: text(policy.video_codec || policy.videoCodec) || "libx264",
    pixel_format: "yuv420p",
    video_bitrate: text(policy.video_bitrate || policy.videoBitrate) || "12M",
    include_source_audio: true,
    audio_codec: "aac",
    audio_bitrate: "256k",
    sample_rate: 48000,
    audio_channels: 2,
    audio_channel_layout: "stereo",
    audio_mix_normalize: false,
    target_duration_seconds: targetDuration,
    tags: ["source-only", "live-performance", "original-audio"],
    version: 2,
  };
}

async function loadProject({ organization_id, creative_project_id }) {
  const project = await CreativeProjectRuntime.get(creative_project_id);
  if (!project || String(project.organization_id) !== String(organization_id)) {
    throw new Error("MASTER_VIDEO_PROJECT_NOT_FOUND");
  }
  const nodes = await AssetGraphRepository.listByProject({
    organization_id,
    creative_project_id,
  });
  return { project, nodes };
}

export const CreativeMasterVideoRenderRuntime = {
  SOURCE_ONLY_MODE,
  ACCEPTANCE_COMMAND,
  RUNTIME_VERSION,

  async preflight({ organization_id, creative_project_id, policy = {} } = {}) {
    if (!organization_id) throw new Error("organization_id required");
    if (!creative_project_id) throw new Error("creative_project_id required");

    const targetDuration = Math.max(
      1,
      finite(policy.target_duration_seconds ?? policy.targetDurationSeconds, 180),
    );
    const minimumSources = Math.max(
      1,
      Math.floor(finite(
        policy.minimum_distinct_original_sources ??
        policy.minimumDistinctOriginalSources,
        4,
      )),
    );
    const maximumPerSource = Math.max(
      1,
      Math.floor(finite(
        policy.maximum_clips_per_original_source ??
        policy.maximumClipsPerOriginalSource,
        4,
      )),
    );

    const { project, nodes } = await loadProject({
      organization_id,
      creative_project_id,
    });
    const moments = verifiedMoments(nodes);
    const selection = buildSelection(moments, targetDuration, maximumPerSource);
    const logo = findLogo(nodes);
    const reasons = [];

    if (!moments.length) reasons.push("VERIFIED_PERFORMANCE_MOMENTS_REQUIRED");
    if (selection.duration_seconds + 0.001 < targetDuration) {
      reasons.push("MASTER_VIDEO_SOURCE_DURATION_INSUFFICIENT");
    }
    if (selection.distinct_source_count < minimumSources) {
      reasons.push("MASTER_VIDEO_SOURCE_DIVERSITY_INSUFFICIENT");
    }
    if (!logo) reasons.push("MASTER_VIDEO_LOGO_REQUIRED");

    return {
      ready: reasons.length === 0,
      reasons,
      organization_id,
      creative_project_id,
      creative_mission_id: project.creative_mission_id || null,
      project_name: project.name || null,
      target_duration_seconds: targetDuration,
      eligible_verified_moment_count: moments.length,
      eligible_verified_duration_seconds: Number(
        moments.reduce((sum, moment) => sum + duration(moment), 0).toFixed(3),
      ),
      selected_clip_count: selection.entries.length,
      selected_duration_seconds: selection.duration_seconds,
      distinct_original_source_count: selection.distinct_source_count,
      minimum_distinct_original_sources: minimumSources,
      logo_asset_node_id: logo?.id || null,
      source_only_ffmpeg: true,
      provider_calls_required: false,
      production_started: false,
      runtime_version: RUNTIME_VERSION,
    };
  },

  async render({
    organization_id,
    creative_project_id,
    authorization = {},
    policy = {},
    heartbeat = null,
  } = {}) {
    authorize(authorization);
    const preflight = await this.preflight({
      organization_id,
      creative_project_id,
      policy,
    });
    if (!preflight.ready) {
      const error = new Error(
        `MASTER_VIDEO_PREFLIGHT_FAILED:${preflight.reasons.join(",")}`,
      );
      error.validation = preflight;
      throw error;
    }

    const { project, nodes } = await loadProject({
      organization_id,
      creative_project_id,
    });
    const moments = verifiedMoments(nodes);
    const selection = buildSelection(
      moments,
      preflight.target_duration_seconds,
      Math.max(1, Math.floor(finite(
        policy.maximum_clips_per_original_source ??
        policy.maximumClipsPerOriginalSource,
        4,
      ))),
    );
    const logo = findLogo(nodes);
    const timelineIdentity = hash({
      runtime: RUNTIME_VERSION,
      creative_project_id,
      entries: selection.entries.map((entry) => ({
        id: entry.source_moment_node_id,
        out: entry.source_out_seconds,
      })),
      logo: logo.id,
    });

    let timeline = nodes.find((node) =>
      node.type === CREATIVE_ASSET_NODE_TYPES.TIMELINE &&
      node.metadata?.master_video_timeline_identity === timelineIdentity &&
      node.status !== CREATIVE_ASSET_NODE_STATUS.ARCHIVED,
    ) || null;

    if (!timeline) {
      timeline = await AssetGraphRepository.create(createCreativeAssetNode({
        organization_id,
        creative_project_id,
        type: CREATIVE_ASSET_NODE_TYPES.TIMELINE,
        status: CREATIVE_ASSET_NODE_STATUS.DERIVED,
        name: `${project.name || "Creative project"} source-only master timeline`,
        description: "Verified source-only live-performance master timeline.",
        lineage: {
          source: "source_only_master_video_timeline",
          provider_id: null,
          capability: "creative.video.master.compose.local",
          generation_version: 2,
        },
        technical: {
          mime_type: "application/vnd.avantiqo.edl+json",
          duration_seconds: preflight.target_duration_seconds,
        },
        metadata: {
          format: "AVANTIQO_EDL_V1",
          edit_decision_list: selection.entries,
          master_video_timeline_identity: timelineIdentity,
          target_duration_seconds: preflight.target_duration_seconds,
          original_audio_required: true,
          exact_lip_sync_required: true,
          video_generation_provider_allowed: false,
          runtime_version: RUNTIME_VERSION,
        },
      }));
    }

    if (typeof heartbeat === "function") {
      await heartbeat({
        stage: "MASTER_VIDEO_RENDERING",
        timeline_asset_node_id: timeline.id,
        provider_calls: 0,
        production_started: true,
      });
    }

    const outroDuration = Math.max(
      3,
      finite(policy.logo_outro_seconds ?? policy.logoOutroSeconds, 8),
    );
    const rendered = await CreativeEdlRenderRuntime.render({
      organization_id,
      timeline_asset_node_id: timeline.id,
      export_profile: exportProfile(policy, preflight.target_duration_seconds),
      tracks: {
        overlays: [{
          asset_node_id: logo.id,
          timeline_in_seconds: preflight.target_duration_seconds - outroDuration,
          duration_seconds: outroDuration,
          width: finite(policy.logo_width ?? policy.logoWidth, 480),
          x: "(main_w-overlay_w)/2",
          y: "main_h-overlay_h-80",
          opacity: 1,
        }],
      },
      policy: {
        ...object(policy),
        render_timeout_ms:
          finite(policy.render_timeout_ms ?? policy.renderTimeoutMs) ||
          4 * 60 * 60 * 1000,
      },
      force: policy.force === true,
    });

    return {
      success: true,
      organization_id,
      creative_project_id,
      timeline_asset_node_id: timeline.id,
      final_render_asset_node_id: rendered.render?.id || null,
      final_render_url: rendered.render?.url || null,
      technical_qc: rendered.technical_qc || null,
      source_only_ffmpeg: true,
      provider_calls: 0,
      video_generation_provider_used: false,
      production_started: true,
      production_completed: true,
      runtime_version: RUNTIME_VERSION,
    };
  },
};
