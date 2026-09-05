export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";
import {
  CreativeMasterVersionRuntime,
} from "@/lib/creative/release/runtime/CreativeMasterVersionRuntime";

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId = body.organization_id || body.organizationId;
    const creativeProjectId = body.creative_project_id || body.creativeProjectId;

    if (!organizationId || !creativeProjectId) {
      return Response.json(
        { success: false, error: "organization_id and creative_project_id required" },
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

    const history = await CreativeMasterVersionRuntime.inspect({
      organization_id: organizationId,
      creative_project_id: creativeProjectId,
      left_master_asset_node_id:
        body.left_master_asset_node_id || body.leftMasterAssetNodeId || null,
      right_master_asset_node_id:
        body.right_master_asset_node_id || body.rightMasterAssetNodeId || null,
    });

    return Response.json({ success: true, history });
  } catch (error) {
    return Response.json(
      { success: false, error: error?.message || String(error) },
      { status: 500 },
    );
  }
}
