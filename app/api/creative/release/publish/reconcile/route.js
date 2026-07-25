export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";
import {
  CreativePublishReconciliationRuntime,
} from "@/lib/creative/release/runtime/CreativePublishReconciliationRuntime";

function safeExecution(execution) {
  return {
    id: execution?.id || null,
    organization_id: execution?.organization_id || null,
    creative_project_id: execution?.creative_project_id || null,
    status: execution?.status || null,
    execution_status: execution?.metadata?.execution_status || null,
    provider_id: execution?.metadata?.provider_id || null,
    provider_job_id: execution?.metadata?.provider_job_id || null,
    external_publication_id:
      execution?.metadata?.external_publication_id || null,
    external_publication_url:
      execution?.metadata?.external_publication_url || null,
    settlement: execution?.metadata?.settlement || null,
    error: execution?.metadata?.error || null,
  };
}

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId = body.organization_id || body.organizationId;
    const executionId =
      body.publish_execution_asset_node_id ||
      body.publishExecutionAssetNodeId ||
      body.execution_id ||
      body.executionId;

    if (!organizationId || !executionId) {
      return Response.json(
        {
          success: false,
          error:
            "organization_id and publish_execution_asset_node_id required",
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

    const execution = await CreativePublishReconciliationRuntime.poll({
      organization_id: organizationId,
      execution_id: executionId,
    });

    return Response.json({
      success: true,
      execution: safeExecution(execution),
    });
  } catch (error) {
    const status =
      error.message === "PUBLISH_EXECUTION_NOT_FOUND" ? 404 :
      error.message.includes("REQUIRED") ? 409 :
      500;
    return Response.json(
      { success: false, error: error.message },
      { status },
    );
  }
}
