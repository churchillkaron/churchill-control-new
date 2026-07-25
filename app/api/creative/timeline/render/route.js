export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";
import {
  CreativeEdlRenderRuntime,
} from "@/lib/creative/post-production/runtime/CreativeEdlRenderRuntime";
import {
  CreativeExportProfileResolver,
} from "@/lib/creative/post-production/runtime/CreativeExportProfileResolver";
import * as AssetGraphRepository
from "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository";
import * as CreativeProjectRepository
from "@/lib/creative/projects/repositories/CreativeProjectRepository";
import {
  CREATIVE_ASSET_NODE_TYPES,
} from "@/lib/creative/assets/graph/documents/CreativeAssetNode";

const PROFILE_FIELDS = new Set([
  "id", "name", "description", "version", "extension", "container",
  "mime_type", "mimeType", "width", "height", "frame_rate", "frameRate",
  "fit", "background", "video_codec", "videoCodec", "video_bitrate",
  "videoBitrate", "pixel_format", "pixelFormat", "include_source_audio",
  "includeSourceAudio", "audio_codec", "audioCodec", "audio_bitrate",
  "audioBitrate", "sample_rate", "sampleRate", "audio_channels",
  "audioChannels", "audio_channel_layout", "audioChannelLayout",
  "audio_mix_normalize", "audioMixNormalize", "subtitle_mode",
  "subtitleMode", "subtitle_codec", "subtitleCodec", "subtitle_style",
  "subtitleStyle", "expected_video_codec", "expectedVideoCodec",
  "expected_audio_codec", "expectedAudioCodec", "duration_tolerance_seconds",
  "durationToleranceSeconds", "tags",
]);

const AUDIO_FIELDS = new Set([
  "asset_node_id", "assetNodeId", "role", "timeline_in_seconds",
  "timelineInSeconds", "source_in_seconds", "sourceInSeconds",
  "duration_seconds", "durationSeconds", "gain",
]);

const OVERLAY_FIELDS = new Set([
  "asset_node_id", "assetNodeId", "timeline_in_seconds", "timelineInSeconds",
  "duration_seconds", "durationSeconds", "x", "y", "width", "height",
  "opacity",
]);

function pick(value = {}, fields) {
  return Object.fromEntries(
    Object.entries(value).filter(([key]) => fields.has(key)),
  );
}

function sanitizeTracks(value = {}) {
  return {
    subtitle_asset_node_id:
      value.subtitle_asset_node_id ||
      value.subtitleAssetNodeId ||
      null,
    audio: (Array.isArray(value.audio) ? value.audio : [])
      .map((track) => pick(track, AUDIO_FIELDS)),
    overlays: (Array.isArray(value.overlays) ? value.overlays : [])
      .map((overlay) => pick(overlay, OVERLAY_FIELDS)),
  };
}

async function enforceReleaseGate({
  organizationId,
  timelineAssetNodeId,
  reportId,
}) {
  const timeline = await AssetGraphRepository.getById(timelineAssetNodeId);
  if (!timeline || timeline.organization_id !== organizationId) {
    throw new Error("Timeline asset node not found");
  }

  const project = await CreativeProjectRepository.getById(
    timeline.creative_project_id,
  );
  if (!project || project.organization_id !== organizationId) {
    throw new Error("Creative project not found");
  }

  const gate = project.metadata?.release_gate || {};
  if (gate.require_before_render !== true) {
    return null;
  }
  if (!reportId) throw new Error("RELEASE_GATE_REPORT_REQUIRED");

  const report = await AssetGraphRepository.getById(reportId);
  if (
    !report ||
    report.organization_id !== organizationId ||
    report.creative_project_id !== timeline.creative_project_id ||
    report.parent_asset_node_id !== timeline.id ||
    report.type !== CREATIVE_ASSET_NODE_TYPES.RELEASE_GATE_REPORT
  ) {
    throw new Error("VALID_RELEASE_GATE_REPORT_REQUIRED");
  }
  if (report.metadata?.passed !== true) {
    throw new Error("RELEASE_GATE_BLOCKED");
  }
  if (
    gate.require_human_approval_before_render === true &&
    report.review?.approved !== true
  ) {
    throw new Error("RELEASE_GATE_HUMAN_APPROVAL_REQUIRED");
  }

  return report;
}

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId = body.organization_id || body.organizationId;
    const timelineAssetNodeId =
      body.timeline_asset_node_id ||
      body.timelineAssetNodeId;

    if (!organizationId || !timelineAssetNodeId) {
      return Response.json(
        {
          success: false,
          error: "organization_id and timeline_asset_node_id required",
        },
        { status: 400 },
      );
    }

    const access = await requireOrganizationAccess({ organizationId });
    if (!access.success) {
      return Response.json(access, { status: access.status });
    }

    const releaseGateReport = await enforceReleaseGate({
      organizationId,
      timelineAssetNodeId,
      reportId:
        body.release_gate_report_id ||
        body.releaseGateReportId ||
        null,
    });

    const manualProfile = pick(
      body.manual_export_profile ||
      body.manualExportProfile ||
      body.export_profile ||
      body.exportProfile ||
      {},
      PROFILE_FIELDS,
    );
    const resolved = await CreativeExportProfileResolver.resolve({
      organization_id: organizationId,
      timeline_asset_node_id: timelineAssetNodeId,
      profile_id:
        body.export_profile_id ||
        body.exportProfileId ||
        null,
      channel: body.channel || null,
      manual_profile: Object.keys(manualProfile).length ? manualProfile : null,
      policy: {},
    });

    const result = await CreativeEdlRenderRuntime.render({
      organization_id: organizationId,
      timeline_asset_node_id: timelineAssetNodeId,
      export_profile: pick(resolved.profile, PROFILE_FIELDS),
      tracks: sanitizeTracks(body.tracks || {}),
      policy: {},
      force: body.force === true,
    });

    return Response.json({
      success: true,
      export_profile_source: resolved.source,
      export_profile_id: resolved.profile.id || resolved.profile.name || null,
      release_gate_report_id: releaseGateReport?.id || null,
      ...result,
    });
  } catch (error) {
    return Response.json(
      { success: false, error: error.message },
      { status: 500 },
    );
  }
}
