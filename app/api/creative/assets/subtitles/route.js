export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";
import {
  CreativeSubtitleRuntime,
} from "@/lib/creative/media/runtime/CreativeSubtitleRuntime";

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId = body.organization_id || body.organizationId;
    const transcriptAssetNodeId =
      body.transcript_asset_node_id ||
      body.transcriptAssetNodeId;

    if (!organizationId || !transcriptAssetNodeId) {
      return Response.json(
        {
          success: false,
          error: "organization_id and transcript_asset_node_id required",
        },
        { status: 400 },
      );
    }

    const access = await requireOrganizationAccess({ organizationId });
    if (!access.success) {
      return Response.json(access, { status: access.status });
    }

    const results = await CreativeSubtitleRuntime.create({
      organization_id: organizationId,
      transcript_asset_node_id: transcriptAssetNodeId,
      formats: body.formats || ["vtt", "srt"],
      options: {
        name: body.name || null,
        description: body.description || null,
        include_speakers:
          body.include_speakers === true ||
          body.includeSpeakers === true,
        tags: Array.isArray(body.tags) ? body.tags : [],
        version: body.version || 1,
      },
      policy: {},
      force: body.force === true,
    });

    return Response.json({
      success: true,
      subtitles: results,
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
