export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";
import {
  CreativeMasterComparisonRuntime,
} from "@/lib/creative/release/runtime/CreativeMasterComparisonRuntime";

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId = body.organization_id || body.organizationId;
    const creativeProjectId = body.creative_project_id || body.creativeProjectId;
    const leftMasterAssetNodeId =
      body.left_master_asset_node_id || body.leftMasterAssetNodeId;
    const rightMasterAssetNodeId =
      body.right_master_asset_node_id || body.rightMasterAssetNodeId;
    const action = String(body.action || "inspect").trim().toLowerCase();

    if (
      !organizationId ||
      !creativeProjectId ||
      !leftMasterAssetNodeId ||
      !rightMasterAssetNodeId
    ) {
      return Response.json(
        {
          success: false,
          error:
            "organization_id, creative_project_id, left_master_asset_node_id and right_master_asset_node_id required",
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

    const input = {
      organization_id: organizationId,
      creative_project_id: creativeProjectId,
      left_master_asset_node_id: leftMasterAssetNodeId,
      right_master_asset_node_id: rightMasterAssetNodeId,
    };
    const comparison = action === "analyze"
      ? await CreativeMasterComparisonRuntime.analyze({
          ...input,
          force: body.force === true,
        })
      : await CreativeMasterComparisonRuntime.inspect(input);

    return Response.json({ success: true, comparison });
  } catch (error) {
    const message = error?.message || String(error);
    const blocker = [
      "PRIMARY_MASTER_VERSION_REQUIRED",
      "DISTINCT_MASTER_VERSIONS_REQUIRED",
      "MASTER_MEDIA_REQUIRED",
      "MASTER_CHECKSUM_REQUIRED",
      "MASTER_COMPARISON_EVIDENCE_UNAVAILABLE",
      "FFMPEG_NOT_CONFIGURED_FOR_MASTER_COMPARISON",
    ].some((value) => message.startsWith(value));
    return Response.json(
      { success: false, error: message },
      { status: blocker ? 409 : 500 },
    );
  }
}
