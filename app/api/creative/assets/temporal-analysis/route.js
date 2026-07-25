export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";
import {
  CreativeTemporalAnalysisRuntime,
} from "@/lib/creative/media/runtime/CreativeTemporalAnalysisRuntime";

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId = body.organization_id || body.organizationId;
    const parentAssetNodeId =
      body.parent_asset_node_id || body.parentAssetNodeId;

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
      request,
      requiredPermission: "creative.media.analyse",
    });
    if (!access.success) {
      return Response.json(access, { status: access.status });
    }

    const result = await CreativeTemporalAnalysisRuntime.analyze({
      organization_id: organizationId,
      parent_asset_node_id: parentAssetNodeId,
      options: {
        threshold: body.threshold,
        minimum_scene_seconds:
          body.minimum_scene_seconds ?? body.minimumSceneSeconds,
        tags: Array.isArray(body.tags) ? body.tags : [],
        version: body.version || 1,
      },
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
