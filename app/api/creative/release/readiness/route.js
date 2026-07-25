export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";
import {
  CreativeReleaseReadinessRuntime,
} from "@/lib/creative/release/runtime/CreativeReleaseReadinessRuntime";

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId = body.organization_id || body.organizationId;
    const creativeProjectId =
      body.creative_project_id || body.creativeProjectId;

    if (!organizationId || !creativeProjectId) {
      return Response.json(
        {
          success: false,
          error: "organization_id and creative_project_id required",
        },
        { status: 400 },
      );
    }

    const access = await requireOrganizationAccess({
      organizationId,
      request,
      requiredPermission: "creative.quality.evaluate",
    });
    if (!access.success) {
      return Response.json(access, { status: access.status });
    }

    const result = await CreativeReleaseReadinessRuntime.evaluate({
      organization_id: organizationId,
      creative_project_id: creativeProjectId,
      timeline_asset_node_id:
        body.timeline_asset_node_id || body.timelineAssetNodeId || null,
      final_render_asset_node_id:
        body.final_render_asset_node_id || body.finalRenderAssetNodeId || null,
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
