export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";
import {
  CreativeApprovalRuntime,
} from "@/lib/creative/release/runtime/CreativeApprovalRuntime";
import {
  CreativeDeliveryAudioQualityRuntime,
} from "@/lib/creative/quality/runtime/CreativeDeliveryAudioQualityRuntime";

const ALLOWED_SCOPES = new Set([
  "PRODUCTION_DOSSIER",
  "RELEASE_GATE",
  "FINAL_RENDER",
  "PUBLISH_RELEASE",
]);

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId = body.organization_id || body.organizationId;
    const subjectAssetNodeId =
      body.subject_asset_node_id || body.subjectAssetNodeId;
    const scope = String(body.scope || "").trim().toUpperCase();
    const approvedCostCeiling = finite(
      body.approved_cost_ceiling ?? body.approvedCostCeiling,
    );

    if (!organizationId || !subjectAssetNodeId || !ALLOWED_SCOPES.has(scope)) {
      return Response.json(
        {
          success: false,
          error: "organization_id, valid subject_asset_node_id and scope required",
        },
        { status: 400 },
      );
    }
    if (
      scope === "PRODUCTION_DOSSIER" &&
      (approvedCostCeiling === null || approvedCostCeiling < 0)
    ) {
      return Response.json(
        {
          success: false,
          error: "approved_cost_ceiling required for production dossier approval",
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

    if (scope === "FINAL_RENDER") {
      const deliveryAudio = await CreativeDeliveryAudioQualityRuntime.inspect({
        organization_id: organizationId,
        render_asset_node_id: subjectAssetNodeId,
      });
      if (deliveryAudio.required && deliveryAudio.passed !== true) {
        return Response.json(
          {
            success: false,
            error: deliveryAudio.blocker || "DELIVERY_AUDIO_QC_REQUIRED",
            delivery_audio: deliveryAudio,
          },
          { status: 409 },
        );
      }
    }

    const result = await CreativeApprovalRuntime.approve({
      organization_id: organizationId,
      subject_asset_node_id: subjectAssetNodeId,
      scope,
      approved_cost_ceiling:
        scope === "PRODUCTION_DOSSIER" ? approvedCostCeiling : null,
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
