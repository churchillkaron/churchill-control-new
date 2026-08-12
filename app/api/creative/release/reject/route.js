export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";
import {
  CreativeHumanDecisionRuntime,
} from "@/lib/creative/release/runtime/CreativeHumanDecisionRuntime";

const ALLOWED_SCOPES = new Set([
  "PRODUCTION_DOSSIER",
  "RELEASE_GATE",
  "FINAL_RENDER",
  "PUBLISH_RELEASE",
]);

function text(value, maximum = 1200) {
  return String(value ?? "").trim().slice(0, maximum);
}

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId = body.organization_id || body.organizationId;
    const subjectAssetNodeId =
      body.subject_asset_node_id || body.subjectAssetNodeId;
    const scope = text(body.scope, 80).toUpperCase();
    const reasonCode =
      text(body.reason_code || body.reasonCode, 120).toUpperCase() ||
      "OWNER_REJECTED";
    const feedback = text(body.feedback || body.notes, 1200);

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

    const result = await CreativeHumanDecisionRuntime.reject({
      organization_id: access.organizationId,
      subject_asset_node_id: subjectAssetNodeId,
      scope,
      rejector: {
        user_id: access.userId,
        staff_account_id: access.staff?.id,
        email: access.userEmail,
      },
      reason_code: reasonCode,
      feedback,
    });

    return Response.json({
      success: true,
      ...result,
      provider_execution: false,
      quality_floor_immutable: true,
    });
  } catch (error) {
    return Response.json(
      { success: false, error: error?.message || String(error) },
      { status: 500 },
    );
  }
}
