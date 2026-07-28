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
const RUNTIME_VERSION = "creative-master-video-source-only-v3";
const EVIDENCE_SOURCE = "LOCAL_ZERO_PROVIDER_SHORTLIST";
const EXCLUDED_AI_STATUSES = new Set([
  "REJECTED",
  "RUNNING",
  "FAILED",
  "FAILED_RECONCILIATION_REQUIRED",
]);

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
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");
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

function candidateRange(candidate) {
  const range = object(candidate?.metadata?.original_source_range);
  const start = finite(range.start_seconds, -1);
  const end = finite(range.end_seconds, -1);
  const suppliedDuration = finite(range.duration_seconds, -1);
  const duration = end > start ? end - start : suppliedDuration;

  if (start < 0 || duration <= 0) return null;

  return {
    start_seconds: start,
    end_seconds: start + duration,
    duration_seconds: duration,
  };
}

function sourceId(candidate) {
  return text(candidate?.metadata?.source_asset_node_id) ||
    text(candidate?.parent_asset_node_id) ||
    null;
}

function candidateScore(candidate) {
  return finite(
    candidate?.metadata?.local_score ??
      candidate?.metadata?.score ??
      candidate?.intelligence?.quality_score ??
      candidate?.intelligence?.reuse_score,
    0,
  );
}

function candidateStatus(candidate) {
  return text(candidate?.metadata?.ai_verification_status || "NOT_SELECTED")
    .toUpperCase();
}

function candidatePriority(candidate) {
  const status = candidateStatus(candidate);
  if (status === "COMPLETE") return 0;
  if (status === "PENDING_AUTHORIZATION") return 1;
  if (status === "NOT_SELECTED") return 2;
  return 3;
}

function unresolvedVerificationCandidates(nodes) {
  return nodes.filter((node) =>
    node.type === CREATIVE_ASSET_NODE_TYPES.MOMENT &&
    node.status !== CREATIVE_ASSET_NODE_STATUS.ARCHIVED &&
    node.metadata?.local_shortlist_candidate === true &&
    ["RUNNING", "FAILED", "FAILED_RECONCILIATION_REQUIRED"].includes(
      candidateStatus(node),
    ),
  );
}

function eligibleLocalCandidates(nodes, policy = {}) {
  const minimumScore = finite(
    policy.minimum_local_score ?? policy.minimumLocalScore,
    0,
  );

  return nodes
    .filter((node) => {
      const status = candidateStatus(node);
      return (
        node.type === CREATIVE_ASSET_NODE_TYPES.MOMENT &&
        node.status !== CREATIVE_ASSET_NODE_STATUS.ARCHIVED &&
        node.metadata?.local_shortlist_candidate === true &&
        node.metadata?.blocked !== true &&
        !EXCLUDED_AI_STATUSES.has(status) &&
        text(node.url) &&
        candidateRange(node) &&
        candidateScore(node) >= minimumScore
      );
    })
    .sort((left, right) => {
      const priorityDifference =
        candidatePriority(left) - candidatePriority(right);
      if (priorityDifference !== 0) return priorityDifference;

      const leftRank = finite(left.metadata?.shortlist_rank, 999999);
      const rightRank = finite(right.metadata?.shortlist_rank, 999999);
      if (leftRank !== rightRank) return leftRank - rightRank;

      return candidateScore(right) - candidateScore(left);
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

function buildSelection(candidates, targetDuration, maximumPerSource) {
  const counts = new Map();
  const preferred = [];
  const overflow = [];

  for (const candidate of candidates) {
    const identity = sourceId(candidate) || candidate.id;
    const count = counts.get(identity) || 0;

    if (count < maximumPerSource) {
      preferred.push(candidate);
      counts.set(identity, count + 1);
    } else {
      overflow.push(candidate);
    }
  }

  const entries = [];
  let cursor = 0;

  for (const candidate of [...preferred, ...overflow]) {
    if (cursor >= targetDuration - 0.001) break;

    const range = candidateRange(candidate);
    if (!range) continue;

    const clipDuration = Math.min(
      range.duration_seconds,
      targetDuration - cursor,
    );
    if (clipDuration <= 0) continue;

    entries.push({
      index: entries.length + 1,
      source_asset_node_id: sourceId(candidate),
      source_clip_node_id: candidate.id,
      source_moment_node_id: candidate.id,
      source_url: candidate.url,
      source_in_seconds: range.start_seconds,
      source_out_seconds: range.start_seconds + clipDuration,
      timeline_in_seconds: cursor,
      timeline_out_seconds: cursor + clipDuration,
      duration_seconds: clipDuration,
      selection_score: candidateScore(candidate),
      local_score_signals: candidate.metadata?.local_score_signals || {},
      evidence_source: EVIDENCE_SOURCE,
      performance_verified: false,
      original_audio_preserved: true,
      exact_lip_sync_required: true,
      human_review_required: true,
      ai_verification_status: candidateStatus(candidate),
      original_source_range: range,
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
    id: "landscape-master-1080p-source-only-local-evidence",
    name: "Cole Ley 3-minute landscape master",
    description:
      "Source-only FFmpeg master from zero-provider local editorial evidence, preserving live audio and lip sync.",
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
    tags: [
      "source-only",
      "local-editorial-evidence",
      "live-performance",
      "original-audio",
      "human-review-required",
    ],
    version: 3,
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
  EVIDENCE_SOURCE,

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
    const candidates = eligibleLocalCandidates(nodes, policy);
    const unresolved = unresolvedVerificationCandidates(nodes);
    const selection = buildSelection(
      candidates,
      targetDuration,
      maximumPerSource,
    );
    const logo = findLogo(nodes);
    const reasons = [];

    if (unresolved.length) {
      reasons.push("LEGACY_VERIFICATION_RECONCILIATION_REQUIRED");
    }
    if (!candidates.length) {
      reasons.push("LOCAL_SHORTLIST_CANDIDATES_REQUIRED");
    }
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
      evidence_source: EVIDENCE_SOURCE,
      target_duration_seconds: targetDuration,
      eligible_local_candidate_count: candidates.length,
      eligible_local_duration_seconds: Number(
        candidates.reduce((sum, candidate) =>
          sum + candidateRange(candidate).duration_seconds,
        0).toFixed(3),
      ),
      excluded_ai_rejected_candidate_count: nodes.filter((node) =>
        node.type === CREATIVE_ASSET_NODE_TYPES.MOMENT &&
        node.metadata?.local_shortlist_candidate === true &&
        candidateStatus(node) === "REJECTED",
      ).length,
      unresolved_legacy_candidate_count: unresolved.length,
      selected_clip_count: selection.entries.length,
      selected_duration_seconds: selection.duration_seconds,
      distinct_original_source_count: selection.distinct_source_count,
      minimum_distinct_original_sources: minimumSources,
      logo_asset_node_id: logo?.id || null,
      source_only_ffmpeg: true,
      provider_calls_required: false,
      human_review_required: true,
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
    const candidates = eligibleLocalCandidates(nodes, policy);
    const selection = buildSelection(
      candidates,
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
      evidence_source: EVIDENCE_SOURCE,
      entries: selection.entries.map((entry) => ({
        id: entry.source_moment_node_id,
        in: entry.source_in_seconds,
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
        status: CREATIVE_ASSET_NODE_STATUS.REVIEW,
        name: `${project.name || "Creative project"} local-evidence master timeline`,
        description:
          "Three-minute source-only master timeline selected from zero-provider local technical evidence.",
        lineage: {
          source: "local_shortlist_master_video_timeline",
          provider_id: null,
          capability: "creative.video.master.compose.local",
          generation_version: 3,
        },
        technical: {
          mime_type: "application/vnd.avantiqo.edl+json",
          duration_seconds: preflight.target_duration_seconds,
        },
        review: {
          ai_reviewed: false,
          human_reviewed: false,
          approved: false,
          notes: "Human review is mandatory because no durable semantic verification result exists.",
        },
        metadata: {
          format: "AVANTIQO_EDL_V1",
          edit_decision_list: selection.entries,
          master_video_timeline_identity: timelineIdentity,
          target_duration_seconds: preflight.target_duration_seconds,
          evidence_source: EVIDENCE_SOURCE,
          original_audio_required: true,
          exact_lip_sync_required: true,
          video_generation_provider_allowed: false,
          human_review_required: true,
          runtime_version: RUNTIME_VERSION,
        },
      }));
    }

    if (typeof heartbeat === "function") {
      await heartbeat({
        stage: "MASTER_VIDEO_RENDERING",
        timeline_asset_node_id: timeline.id,
        evidence_source: EVIDENCE_SOURCE,
        provider_calls: 0,
        production_started: true,
      });
    }

    const outroDuration = Math.min(
      preflight.target_duration_seconds,
      Math.max(3, finite(
        policy.logo_outro_seconds ?? policy.logoOutroSeconds,
        8,
      )),
    );
    const rendered = await CreativeEdlRenderRuntime.render({
      organization_id,
      timeline_asset_node_id: timeline.id,
      export_profile: exportProfile(
        policy,
        preflight.target_duration_seconds,
      ),
      tracks: {
        overlays: [{
          asset_node_id: logo.id,
          timeline_in_seconds:
            preflight.target_duration_seconds - outroDuration,
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
      evidence_source: EVIDENCE_SOURCE,
      source_only_ffmpeg: true,
      provider_calls: 0,
      video_generation_provider_used: false,
      human_review_required: true,
      production_started: true,
      production_completed: true,
      runtime_version: RUNTIME_VERSION,
    };
  },
};
