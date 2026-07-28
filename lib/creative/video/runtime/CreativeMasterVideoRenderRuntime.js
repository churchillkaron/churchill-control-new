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
import {
  buildVerifiedSelection,
} from "@/lib/creative/video/runtime/CreativeVerifiedMomentSelection";

const SOURCE_ONLY_MODE = "SOURCE_ONLY_FFMPEG";
const ACCEPTANCE_COMMAND = "MISSION_ACCEPTED";
const RUNTIME_VERSION = "creative-master-video-verified-editorial-v4";
const EVIDENCE_SOURCE = "DURABLE_SEMANTIC_VERIFICATION";

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
    /logo/i.test(`${node.name || ""} ${node.metadata?.original_file_name || ""}`),
  ) || null;
}

function rejectionSummary(selection) {
  const counts = new Map();
  for (const record of selection.rejected) {
    for (const reason of record.reasons) {
      counts.set(reason, (counts.get(reason) || 0) + 1);
    }
  }
  return Object.fromEntries([...counts.entries()].sort());
}

function timelineApproved(timeline) {
  return (
    timeline?.review?.human_reviewed === true &&
    timeline?.review?.approved === true &&
    timeline?.status !== CREATIVE_ASSET_NODE_STATUS.ARCHIVED
  );
}

function exportProfile(policy, targetDuration) {
  return {
    id: "verified-editorial-master-1080p",
    name: "Verified editorial master",
    description:
      "Source-only master assembled exclusively from exact semantically verified and editorially approved moments.",
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
      "semantic-verification-complete",
      "exact-verified-ranges",
      "editorial-approval-complete",
      "source-audio-preserved",
    ],
    version: 4,
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

function selectionFor(nodes, policy, targetDuration, maximumPerSource) {
  const selection = buildVerifiedSelection({
    nodes,
    target_duration_seconds: targetDuration,
    maximum_clips_per_source: maximumPerSource,
    policy: {
      ...object(policy),
      require_human_approval: true,
    },
  });
  selection.entries = selection.entries.map((entry) => ({
    ...entry,
    source_in_seconds: 0,
    source_out_seconds: entry.duration_seconds,
  }));
  return selection;
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
    const selection = selectionFor(
      nodes,
      policy,
      targetDuration,
      maximumPerSource,
    );
    const logo = findLogo(nodes);
    const reasons = [];

    if (!selection.eligible.length) {
      reasons.push("VERIFIED_EDITORIALLY_APPROVED_MOMENTS_REQUIRED");
    }
    if (selection.duration_seconds + 0.001 < targetDuration) {
      reasons.push("VERIFIED_SOURCE_DURATION_INSUFFICIENT");
    }
    if (selection.distinct_source_count < minimumSources) {
      reasons.push("VERIFIED_SOURCE_DIVERSITY_INSUFFICIENT");
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
      verified_candidate_count: selection.eligible.length,
      rejected_candidate_count: selection.rejected.length,
      rejection_summary: rejectionSummary(selection),
      selected_clip_count: selection.entries.length,
      selected_duration_seconds: selection.duration_seconds,
      distinct_original_source_count: selection.distinct_source_count,
      minimum_distinct_original_sources: minimumSources,
      maximum_semantic_sample_gap_seconds: finite(
        policy.maximum_semantic_sample_gap_seconds ??
          policy.maximumSemanticSampleGapSeconds,
        2,
      ),
      logo_asset_node_id: logo?.id || null,
      exact_verified_ranges_only: true,
      semantic_verification_required: true,
      clip_editorial_approval_required: true,
      timeline_editorial_approval_required: true,
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
    const maximumPerSource = Math.max(
      1,
      Math.floor(finite(
        policy.maximum_clips_per_original_source ??
          policy.maximumClipsPerOriginalSource,
        4,
      )),
    );
    const selection = selectionFor(
      nodes,
      policy,
      preflight.target_duration_seconds,
      maximumPerSource,
    );
    const logo = findLogo(nodes);
    const timelineIdentity = hash({
      runtime: RUNTIME_VERSION,
      creative_project_id,
      entries: selection.entries.map((entry) => ({
        moment_id: entry.source_moment_node_id,
        candidate_id: entry.source_shortlist_candidate_id,
        derivative_in: entry.source_in_seconds,
        derivative_out: entry.source_out_seconds,
        exact_original_range: entry.exact_original_source_range,
        semantic_coverage: entry.semantic_coverage,
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
        name: `${project.name || "Creative project"} verified master timeline`,
        description:
          "Exact semantically verified moments assembled for mandatory final editorial approval before rendering.",
        lineage: {
          source: "verified_editorial_master_timeline",
          provider_id: null,
          capability: "creative.video.master.compose.verified",
          generation_version: 4,
        },
        technical: {
          mime_type: "application/vnd.avantiqo.edl+json",
          duration_seconds: preflight.target_duration_seconds,
        },
        review: {
          ai_reviewed: true,
          human_reviewed: false,
          approved: false,
          notes:
            "Rendering is blocked until a human approves this exact assembled timeline.",
        },
        metadata: {
          format: "AVANTIQO_EDL_V1",
          edit_decision_list: selection.entries,
          master_video_timeline_identity: timelineIdentity,
          target_duration_seconds: preflight.target_duration_seconds,
          evidence_source: EVIDENCE_SOURCE,
          exact_verified_ranges_only: true,
          semantic_verification_required: true,
          original_audio_required: true,
          exact_lip_sync_required: true,
          video_generation_provider_allowed: false,
          timeline_human_approval_required: true,
          production_started: false,
          runtime_version: RUNTIME_VERSION,
        },
      }));
    }

    if (!timelineApproved(timeline)) {
      const error = new Error("MASTER_VIDEO_TIMELINE_APPROVAL_REQUIRED");
      error.validation = {
        ready: false,
        production_started: false,
        timeline_asset_node_id: timeline.id,
        timeline_identity: timelineIdentity,
        required_review: {
          human_reviewed: true,
          approved: true,
        },
      };
      throw error;
    }

    if (typeof heartbeat === "function") {
      await heartbeat({
        stage: "MASTER_VIDEO_RENDERING",
        timeline_asset_node_id: timeline.id,
        evidence_source: EVIDENCE_SOURCE,
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
      exact_verified_ranges_only: true,
      semantic_verification_complete: true,
      clip_editorial_approval_complete: true,
      timeline_editorial_approval_complete: true,
      source_only_ffmpeg: true,
      provider_calls: 0,
      production_started: true,
      production_completed: true,
      runtime_version: RUNTIME_VERSION,
    };
  },
};
