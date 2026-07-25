export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";
import {
  CreativeEdlRenderRuntime,
} from "@/lib/creative/post-production/runtime/CreativeEdlRenderRuntime";

const PROFILE_FIELDS = new Set([
  "id",
  "name",
  "description",
  "version",
  "extension",
  "container",
  "mime_type",
  "mimeType",
  "width",
  "height",
  "frame_rate",
  "frameRate",
  "fit",
  "background",
  "video_codec",
  "videoCodec",
  "video_bitrate",
  "videoBitrate",
  "pixel_format",
  "pixelFormat",
  "include_source_audio",
  "includeSourceAudio",
  "audio_codec",
  "audioCodec",
  "audio_bitrate",
  "audioBitrate",
  "sample_rate",
  "sampleRate",
  "audio_channels",
  "audioChannels",
  "audio_mix_normalize",
  "audioMixNormalize",
  "subtitle_mode",
  "subtitleMode",
  "subtitle_codec",
  "subtitleCodec",
  "subtitle_style",
  "subtitleStyle",
  "expected_video_codec",
  "expectedVideoCodec",
  "expected_audio_codec",
  "expectedAudioCodec",
  "duration_tolerance_seconds",
  "durationToleranceSeconds",
  "tags",
]);

const AUDIO_FIELDS = new Set([
  "asset_node_id",
  "assetNodeId",
  "role",
  "timeline_in_seconds",
  "timelineInSeconds",
  "source_in_seconds",
  "sourceInSeconds",
  "duration_seconds",
  "durationSeconds",
  "gain",
]);

const OVERLAY_FIELDS = new Set([
  "asset_node_id",
  "assetNodeId",
  "timeline_in_seconds",
  "timelineInSeconds",
  "duration_seconds",
  "durationSeconds",
  "x",
  "y",
  "width",
  "height",
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

    const result = await CreativeEdlRenderRuntime.render({
      organization_id: organizationId,
      timeline_asset_node_id: timelineAssetNodeId,
      export_profile: pick(body.export_profile || body.exportProfile || {}, PROFILE_FIELDS),
      tracks: sanitizeTracks(body.tracks || {}),
      policy: {},
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
