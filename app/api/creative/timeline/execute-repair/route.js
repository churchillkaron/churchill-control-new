export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";
import {
  CreativeRenderRepairExecutionRuntime,
} from "@/lib/creative/quality/runtime/CreativeRenderRepairExecutionRuntime";

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId = body.organization_id || body.organizationId;
    const repairPlanAssetNodeId =
      body.repair_plan_asset_node_id ||
      body.repairPlanAssetNodeId;

    if (!organizationId || !repairPlanAssetNodeId) {
      return Response.json(
        {
          success: false,
          error: "organization_id and repair_plan_asset_node_id required",
        },
        { status: 400 },
      );
    }

    const access = await requireOrganizationAccess({ organizationId });
    if (!access.success) {
      return Response.json(access, { status: access.status });
    }

    const result = await CreativeRenderRepairExecutionRuntime.execute({
      organization_id: organizationId,
      repair_plan_asset_node_id: repairPlanAssetNodeId,
      policy: {
        allow_automatic_repair: body.allow_automatic_repair === true,
        max_repair_attempts: body.max_repair_attempts,
      },
    });

    return Response.json({ success: true, ...result });
  } catch (error) {
    return Response.json(
      { success: false, error: error.message },
      { status: 500 },
    );
  }
}
