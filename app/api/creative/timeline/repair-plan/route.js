export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";
import {
  CreativeRenderRepairRuntime,
} from "@/lib/creative/quality/runtime/CreativeRenderRepairRuntime";

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId = body.organization_id || body.organizationId;
    const renderAssetNodeId =
      body.render_asset_node_id || body.renderAssetNodeId;

    if (!organizationId || !renderAssetNodeId) {
      return Response.json(
        {
          success: false,
          error: "organization_id and render_asset_node_id required",
        },
        { status: 400 },
      );
    }

    const access = await requireOrganizationAccess({
      organizationId,
      request,
      requiredPermission: "creative.repair.plan",
    });
    if (!access.success) {
      return Response.json(access, { status: access.status });
    }

    const result = await CreativeRenderRepairRuntime.plan({
      organization_id: organizationId,
      render_asset_node_id: renderAssetNodeId,
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
