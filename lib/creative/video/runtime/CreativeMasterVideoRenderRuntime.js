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
const RUNTIME_VERSION = "creative-master-video-source-only-v1";

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

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function upper(value) {
  return text(value).toUpperCase();
}

function hash(value) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");
}

function momentDuration(moment) {
  return finite(
    moment?.metadata?.clip_range?.duration_seconds ??
    moment?.technical?.duration_seconds,
    0,
  );
}

function shortlistRank(candidate) {
  return finite(candidate?.metadata?.shortlist_rank, 999999);
}

function candidateScore(candidate) {
  return finite(
    candidate?.metadata?.score ??
    candidate?.intelligence?.reuse_score,
    0,
  );
}

function renderAuthorization(authorization = {}) {
  const approved = authorization.approved === true;
  const command = upper(
    authorization.command || authorization.acceptance_command,
  );
  const mode = upper(
    authorization.production_mode || authorization.productionMode,
  );
  const providersDisabled =
    authorization.allow_provider_calls === false ||
    authorization.allowProviderCalls === false;

  if (!approved || command !== ACCEPTANCE_COMMAND) {
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
    approved_by: text(authorization.approved_by || authorization.approvedBy) || null,
    approved_at: text(authorization.approved_at || authorization.approvedAt) || null,
  };
}

function selectedCandidates(nodes) {
  return nodes
    .filter((node) =>
      node.type === CREATIVE_ASSET_NODE_TYPES.MOMENT &&
      node.metadata?.local_shortlist_candidate === true &&
      node.metadata?.selected_for_ai_verification === true &&
      upper(node.metadata?.ai_verification_status) === "COMPLETE" &&
      node.status !== CREATIVE_ASSET_NODE_STATUS.ARCHIVED,
    )
    .sort((left, right) => {
      const rankDifference = shortlistRank(left) - shortlistRank(right);
      if (rankDifference !== 0) return rankDifference;
      return candidateScore(right) - candidateScore(left);
    });
}

function verifiedMomentSelection(nodes, candidates) {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const selected = [];
  const seen = new Set();

  for (const candidate of candidates) {
    const originalSourceId = text(candidate.metadata?.source_asset_node_id) || null;
    for (const momentId of list(candidate.metadata?.verified_moment_ids)) {
      if (seen.has(momentId)) continue;
      const moment = nodeMap.get(momentId);
      if (!moment) continue;
      if (moment.type !== CREATIVE_ASSET_NODE_TYPES.MOMENT) continue;
      if (moment.status === CREATIVE_ASSET_NODE_STATUS.ARCHIVED) continue;
      if (moment.metadata?.performance_verified !== true) continue;
      if (moment.metadata?.blocked === true) continue;
      if (moment.metadata?.original_audio_preserved !== true) continue;
      if (!text(moment.url)) continue;
      const duration = momentDuration(moment);
      if (!(duration > 0)) continue;

      selected.push({
        candidate,
        moment,
        duration_seconds: duration,
        original_source_asset_node_id: originalSourceId,
        shortlist_rank: shortlistRank(candidate),
        score: finite(
          moment.metadata?.score ??
          moment.intelligence?.reuse_score ??
          candidateScore(candidate),
          0,
        ),
      });
      seen.add(momentId);
    }
  }

  return selected;
}

function selectTimelineEntries(eligible, targetDuration, policy = {}) {
  const maximumPerSource = Math.max(
    1,
    Math.floor(finite(
      policy.maximum_clips_per_original_source ??
      policy.maximumClipsPerOriginalSource,
      4,
    )),
  );
  const sourceCounts = new Map();
  const primary = [];
  const overflow = [];

  for (const item of eligible) {
    const sourceId = item.original_source_asset_node_id || item.moment.id;
    const count = sourceCounts.get(sourceId) || 0;
    if (count < maximumPerSource) {
      primary.push(item);
      sourceCounts.set(sourceId, count + 1);
    } else {
      overflow.push(item);
    }
  }

  const ordered = [...primary, ...overflow];
  const entries = [];
  let cursor = 0;

  for (const item of ordered) {
    if (cursor >= targetDuration - 0.001) break;
    const available = item.duration_seconds;
    const duration = Math.min(available, targetDuration - cursor);
    if (duration <= 0) continue;

    entries.push({
      index: entries.length + 1,
      source_asset_node_id: item.original_source_asset_node_id,
      source_clip_node_id:
        item.moment.metadata?.source_clip_node_id ||
        item.moment.parent_asset_node_id ||
        null,
      source_moment_node_id: item.moment.id,
      source_candidate_node_id: item.candidate.id,
      source_url: item.moment.url,
      source_in_seconds: 0,
      source_out_seconds: duration,
      timeline_in_seconds: cursor,
      timeline_out_seconds: cursor + duration,
      duration_seconds: duration,
      selection_score: item.score,
      shortlist_rank: item.shortlist_rank,
      performance_verified: true,
      original_audio_preserved: true,
      exact_lip_sync_required: true,
      original_source_range: item.moment.metadata?.original_source_range || null,
      reframe_plan: item.moment.metadata?.reframe_plan || null,
    });
    cursor += duration;
  }

  return {
    entries,
    duration_seconds: Number(cursor.toFixed(6)),
    distinct_original_source_count: new Set(
      entries.map((entry) => entry.source_asset_node_id).filter(Boolean),
    ).size,
  };
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
    /cole[-_ ]?logo/i.test(`${node.name || ""} ${node.metadata?.original_file_name || ""}`),
  ) || null;
}

function readinessReasons({
  project,
  candidates,
  eligible,
  timeline,
  targetDuration,
  minimumDistinctSources,
  logo,
}) {
  const reasons = [];
  if (!project) reasons.push("PROJECT_NOT_FOUND");
  if (!candidates.length) reasons.push("VERIFIED_SHORTLIST_CANDIDATES_REQUIRED");
  if (!eligible.length) reasons.push("VERIFIED_PERFORMANCE_MOMENTS_REQUIRED");
  if (timeline.duration_seconds + 0.001 < targetDuration) {
    reasons.push("MASTER_VIDEO_SOURCE_DURATION_INSUFFICIENT");
  }
  if (timeline.distinct_original_source_count < minimumDistinctSources) {
    reasons.push("MASTER_VIDEO_SOURCE_DIVERSITY_INSUFFICIENT");
  }
  if (!logo) reasons.push("MASTER_VIDEO_LOGO_REQUIRED");
  return reasons;
}

function exportProfile(policy = {}, targetDuration) {
  return {
    id: text(policy.export_profile_id || policy.exportProfileId) ||
      "landscape-master-1080p-source-only",
    name: text(policy.export_profile_name || policy.exportProfileName) ||
      "Cole Ley 3-minute landscape master",
    description:
      "Source-only Avantiqo FFmpeg master preserving original live audio and lip synchronisation.",
    extension: "mp4",
    container: "mp4",
    mime_type: "video/mp4",
    width: Math.max(1, finite(policy.output_width ?? policy.outputWidth, 1920)),
    height: Math.max(1, finite(policy.output_height ?? policy.outputHeight, 1080)),
    frame_rate: Math.max(1, finite(policy.frame_rate ?? policy.frameRate, 30)),
    fit: text(policy.fit) || "cover",
    background: text(policy.background) || "black",
    video_codec: text(policy.video_codec || policy.videoCodec) || "libx264",
    pixel_format: text(policy.pixel_format || policy.pixelFormat) || "yuv420p",
    video_bitrate: text(policy.video_bitrate || policy.videoBitrate) || "12M",
    include_source_audio: true,
    audio_codec: text(policy.audio_codec || policy.audioCodec) || "aac",
    audio_bitrate: text(policy.audio_bitrate || policy.audioBitrate) || "256k",
    sample_rate: Math.max(1, finite(policy.sample_rate ?? policy.sampleRate, 48000)),
    audio_channels: Math.max(1, finite(policy.audio_channels ?? policy.audioChannels, 2)),
    audio_channel_layout:
      text(policy.audio_channel_layout || policy.audioChannelLayout) || "stereo",
    audio_mix_normalize: false,
    target_duration_seconds: targetDuration,
    tags: [
      "source-only",
      "live-performance",
      "original-audio",
      "lip-sync-preserved",
      "avantiqo-local-render",
    ],
    version: 1,
  };
}

async function projectAndNodes({ organization_id, creative_project_id }) {
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

  async preflight({
    organization_id,
    creative_project_id,
    policy = {},
  } = {}) {
    if (!organization_id) throw new Error("organization_id required");
    if (!creative_project_id) throw new Error("creative_project_id required");

    const targetDuration = Math.max(
      1,
      finite(
        policy.target_duration_seconds ?? policy.targetDurationSeconds,
        180,
      ),
    );
    const minimumDistinctSources = Math.max(
      1,
      Math.floor(finite(
        policy.minimum_distinct_original_sources ??
        policy.minimumDistinctOriginalSources,
        4,
      )),
    );

    const { project, nodes } = await projectAndNodes({
      organization_id,
      creative_project_id,
    });
    const candidates = selectedCandidates(nodes);
    const eligible = verifiedMomentSelection(nodes, candidates);
    const timeline = selectTimelineEntries(eligible, targetDuration, policy);
    const logo = findLogo(nodes);
    const reasons = readinessReasons({
      project,
      candidates,
      eligible,
      timeline,
      targetDuration,
      minimumDistinctSources,
      logo,
    });

    return {
      ready: reasons.length === 0,
      reasons,
      organization_id,
      creative_project_id,
      creative_mission_id: project.creative_mission_id || null,
      project_name: project.name || null,
      target_duration_seconds: targetDuration,
      verified_candidate_count: candidates.length,
      eligible_verified_moment_count: eligible.length,
      eligible_verified_duration_seconds: Number(
        eligible.reduce((sum, item) => sum + item.duration_seconds, 0).toFixed(3),
      ),
      selected_clip_count: timeline.entries.length,
      selected_duration_seconds: timeline.duration_seconds,
      distinct_original_source_count: timeline.distinct_original_source_count,
      minimum_distinct_original_sources: minimumDistinctSources,
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
    creative_mission_id = null,
    authorization = {},
    policy = {},
    heartbeat = null,
  } = {}) {
    if (!organization_id) throw new Error("organization_id required");
    if (!creative_project_id) throw new Error("creative_project_id required");
    const accepted = renderAuthorization(authorization);

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

    if (typeof heartbeat === "function") {
      await heartbeat({
        stage: "MASTER_VIDEO_PREFLIGHT_PASSED",
        message: "Verified source-only footage and branding are ready for local FFmpeg assembly",
        ...preflight,
        production_started: false,
      });
    }

    const { project, nodes } = await projectAndNodes({
      organization_id,
      creative_project_id,
    });
    const candidates = selectedCandidates(nodes);
    const eligible = verifiedMomentSelection(nodes, candidates);
    const targetDuration = preflight.target_duration_seconds;
    const selected = selectTimelineEntries(eligible, targetDuration, policy);
    const logo = findLogo(nodes);
    const timelineIdentity = hash({
      runtime: RUNTIME_VERSION,
      organization_id,
      creative_project_id,
      target_duration_seconds: targetDuration,
      entries: selected.entries.map((entry) => ({
        source_moment_node_id: entry.source_moment_node_id,
        source_in_seconds: entry.source_in_seconds,
        source_out_seconds: entry.source_out_seconds,
      })),
      logo_asset_node_id: logo.id,
    });

    let timeline = nodes.find((node) =>
      node.type === CREATIVE_ASSET_NODE_TYPES.TIMELINE &&
      node.metadata?.master_video_timeline_identity === timelineIdentity &&
      node.status !== CREATIVE_ASSET_NODE_STATUS.ARCHIVED,
    ) || null;
    let timelineReused = Boolean(timeline);

    if (!timeline) {
      timeline = await AssetGraphRepository.create(createCreativeAssetNode({
        organization_id,
        creative_project_id,
        type: CREATIVE_ASSET_NODE_TYPES.TIMELINE,
        status: CREATIVE_ASSET_NODE_STATUS.DERIVED,
        name: `${project.name || "Creative project"} source-only master timeline`,
        description:
          "Exactly 180 seconds of verified live-performance footage assembled from approved source moments.",
        lineage: {
          source: "source_only_master_video_timeline",
          provider_id: null,
          capability: "creative.video.master.compose.local",
          generation_version: 1,
        },
        technical: {
          mime_type: "application/vnd.avantiqo.edl+json",
          duration_seconds: targetDuration,
        },
        intelligence: {
          safety_status: "REVIEW_REQUIRED",
          tags: [
            "source-only",
            "verified-performance",
            "original-audio",
            "exact-lip-sync",
          ],
        },
        reuse: {
          reusable: false,
          approved_for_reuse: false,
        },
        review: {
          ai_reviewed: true,
          human_reviewed: false,
          approved: false,
          notes: "Source eligibility and exact duration validated before render.",
        },
        metadata: {
          format: "AVANTIQO_EDL_V1",
          edit_decision_list: selected.entries,
          master_video_timeline_identity: timelineIdentity,
          target_duration_seconds: targetDuration,
          total_duration_seconds: selected.duration_seconds,
          clip_count: selected.entries.length,
          distinct_original_source_count:
            selected.distinct_original_source_count,
          verified_performance_only: true,
          original_audio_required: true,
          exact_lip_sync_required: true,
          video_generation_provider_allowed: false,
          runtime_version: RUNTIME_VERSION,
          creative_mission_id:
            creative_mission_id || project.creative_mission_id || null,
          created_at: new Date().toISOString(),
        },
      }));
      timelineReused = false;
    }

    if (typeof heartbeat === "function") {
      await heartbeat({
        stage: "MASTER_VIDEO_RENDERING",
        message: "Avantiqo is rendering the approved source timeline locally with FFmpeg",
        timeline_asset_node_id: timeline.id,
        selected_clip_count: selected.entries.length,
        selected_duration_seconds: selected.duration_seconds,
        provider_calls: 0,
        production_started: true,
      });
    }

    const outroDuration = Math.min(
      targetDuration,
      Math.max(3, finite(policy.logo_outro_seconds ?? policy.logoOutroSeconds, 8)),
    );
    const tracks = {
      overlays: [{
        asset_node_id: logo.id,
        timeline_in_seconds: targetDuration - outroDuration,
        duration_seconds: outroDuration,
        width: Math.max(80, finite(policy.logo_width ?? policy.logoWidth, 480)),
        x: "(main_w-overlay_w)/2",
        y: "main_h-overlay_h-80",
        opacity: 1,
      }],
    };

    const rendered = await CreativeEdlRenderRuntime.render({
      organization_id,
      timeline_asset_node_id: timeline.id,
      export_profile: exportProfile(policy, targetDuration),
      tracks,
      policy: {
        ...object(policy),
        render_timeout_ms:
          finite(policy.render_timeout_ms ?? policy.renderTimeoutMs) ||
          4 * 60 * 60 * 1000,
      },
      force: policy.force === true,
    });

    if (typeof heartbeat === "function") {
      await heartbeat({
        stage: "MASTER_VIDEO_RENDERED",
        message: "Source-only master render completed and stored for review",
        timeline_asset_node_id: timeline.id,
        final_render_asset_node_id: rendered.render?.id || null,
        provider_calls: 0,
        production_started: true,
        production_completed: true,
      });
    }

    return {
      success: true,
      organization_id,
      creative_project_id,
      creative_mission_id:
        creative_mission_id || project.creative_mission_id || null,
      authorization: accepted,
      timeline_asset_node_id: timeline.id,
      timeline_reused: timelineReused,
      final_render_asset_node_id: rendered.render?.id || null,
      final_render_url: rendered.render?.url || null,
      render_reused: rendered.reused === true,
      technical_qc: rendered.technical_qc || null,
      target_duration_seconds: targetDuration,
      selected_clip_count: selected.entries.length,
      distinct_original_source_count:
        selected.distinct_original_source_count,
      source_only_ffmpeg: true,
      provider_calls: 0,
      video_generation_provider_used: false,
      production_started: true,
      production_completed: true,
      runtime_version: RUNTIME_VERSION,
    };
  },
};
