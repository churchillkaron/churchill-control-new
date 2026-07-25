export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";
import {
  CreativeApprovalRuntime,
} from "@/lib/creative/release/runtime/CreativeApprovalRuntime";

const ALLOWED_SCOPES = new Set([
  "RELEASE_GATE",
  "FINAL_RENDER",
  "PUBLISH_RELEASE",
]);

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId = body.organization_id || body.organizationId;
    const subjectAssetNodeId =
      body.subject_asset_node_id || body.subjectAssetNodeId;
    const scope = String(body.scope || "").trim().toUpperCase();

    if (!organizationId || !subjectAssetNodeId || !ALLOWED_SCOPES.has(scope)) {
      return Response.json(
        {
          success: false,
          error: "organization_id, valid subject_asset_node_id and scope required",
        },
        { status: 400 },
      );
    }

    const access = await requireOrganizationAccess({
      organizationId,
      request,
      requiredPermission:
        scope === "PUBLISH_RELEASE"
          ? "creative.release.publish"
          : "creative.release.approve",
    });
    if (!access.success) {
      return Response.json(access, { status: access.status });
    }

    const result = await CreativeApprovalRuntime.approve({
      organization_id: organizationId,
      subject_asset_node_id: subjectAssetNodeId,
      scope,
      approver: {
        user_id: access.userId,
        staff_account_id: access.staff?.id,
        email: access.userEmail,
      },
      notes: body.notes || "",
    });

    return Response.json({ success: true, ...result });
  } catch (error) {
    return Response.json(
      { success: false, error: error.message },
      { status: 500 },
    );
  }
}
