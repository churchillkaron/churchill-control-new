export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";
import {
  CreativeDeliveryAudioQualityRuntime,
} from "@/lib/creative/quality/runtime/CreativeDeliveryAudioQualityRuntime";

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId = body.organization_id || body.organizationId;
    const renderAssetNodeId = body.render_asset_node_id || body.renderAssetNodeId;
    const action = String(body.action || "inspect").trim().toLowerCase();

    if (!organizationId || !renderAssetNodeId) {
      return Response.json(
        {
          success: false,
          error: "organization_id and render_asset_node_id required",
        },
        { status: 400 },
      );
    }

    if (!["inspect", "analyze"].includes(action)) {
      return Response.json(
        { success: false, error: "Unsupported delivery audio QC action" },
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

    const result = action === "analyze"
      ? await CreativeDeliveryAudioQualityRuntime.analyze({
          organization_id: organizationId,
          render_asset_node_id: renderAssetNodeId,
          force: body.force === true,
        })
      : await CreativeDeliveryAudioQualityRuntime.inspect({
          organization_id: organizationId,
          render_asset_node_id: renderAssetNodeId,
        });

    return Response.json({ success: true, result });
  } catch (error) {
    return Response.json(
      { success: false, error: error?.message || String(error) },
      { status: 500 },
    );
  }
}
