export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

import {
  CreativeMediaDerivativeRuntime,
} from "@/lib/creative/media/runtime/CreativeMediaDerivativeRuntime";

const PROFILE_FIELDS = new Set([
  "id",
  "name",
  "description",
  "kind",
  "operation",
  "engine",
  "asset_type",
  "assetType",
  "extension",
  "format",
  "output_format",
  "outputFormat",
  "mime_type",
  "mimeType",
  "width",
  "height",
  "fit",
  "position",
  "background",
  "without_enlargement",
  "withoutEnlargement",
  "animated",
  "resize",
  "format_options",
  "formatOptions",
  "video_codec",
  "audio_codec",
  "video_bitrate",
  "audio_bitrate",
  "sample_rate",
  "channels",
  "frame_rate",
  "scale",
  "pixel_format",
  "movable_metadata",
  "cache_control",
  "cacheControl",
  "timeout_ms",
  "timeoutMs",
  "capability",
  "version",
  "tags",
]);

function sanitizeProfile(profile = {}) {
  return Object.fromEntries(
    Object.entries(profile).filter(([key]) => PROFILE_FIELDS.has(key)),
  );
}

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId = body.organization_id || body.organizationId;
    const parentAssetNodeId =
      body.parent_asset_node_id ||
      body.parentAssetNodeId;

    if (!organizationId || !parentAssetNodeId) {
      return Response.json(
        {
          success: false,
          error: "organization_id and parent_asset_node_id required",
        },
        { status: 400 },
      );
    }

    const access = await requireOrganizationAccess({
      organizationId,
    });
    if (!access.success) {
      return Response.json(access, { status: access.status });
    }

    const profiles = (Array.isArray(body.profiles) ? body.profiles : [])
      .map(sanitizeProfile);
    const derivatives = await CreativeMediaDerivativeRuntime.create({
      organization_id: organizationId,
      parent_asset_node_id: parentAssetNodeId,
      profiles,
      policy: {},
    });

    return Response.json({
      success: true,
      derivatives,
    });
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 },
    );
  }
}
