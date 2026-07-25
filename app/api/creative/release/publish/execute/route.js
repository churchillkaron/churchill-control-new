export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";
import {
  CreativePublishExecutionRuntime,
} from "@/lib/creative/release/runtime/CreativePublishExecutionRuntime";

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId = body.organization_id || body.organizationId;
    const publishCommandAssetNodeId =
      body.publish_command_asset_node_id ||
      body.publishCommandAssetNodeId;

    if (!organizationId || !publishCommandAssetNodeId) {
      return Response.json(
        {
          success: false,
          error:
            "organization_id and publish_command_asset_node_id required",
        },
        { status: 400 },
      );
    }

    const access = await requireOrganizationAccess({
      organizationId,
      request,
      requiredPermission: "creative.release.publish.execute",
    });
    if (!access.success) {
      return Response.json(access, { status: access.status });
    }

    const result = await CreativePublishExecutionRuntime.execute({
      organization_id: organizationId,
      publish_command_asset_node_id: publishCommandAssetNodeId,
      executed_by: {
        user_id: access.userId,
        staff_account_id: access.staff?.id,
      },
    });
    const status = result.execution?.metadata?.execution_status || null;

    return Response.json({
      success: true,
      publication_executed: status === "COMPLETED",
      publication_pending: status === "PENDING_PROVIDER",
      reconciliation_required:
        result.reconciliation_required === true ||
        status === "RECONCILIATION_REQUIRED",
      ...result,
    });
  } catch (error) {
    const conflict = new Set([
      "PUBLISH_COMMAND_ALREADY_CLAIMED",
      "PENDING_PUBLISH_COMMAND_REQUIRED",
    ]).has(error.message);

    return Response.json(
      { success: false, error: error.message },
      { status: conflict ? 409 : 500 },
    );
  }
}
