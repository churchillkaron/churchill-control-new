export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";
import {
  CreativeMasterDeltaReviewRuntime,
} from "@/lib/creative/release/runtime/CreativeMasterDeltaReviewRuntime";

function projectId(body = {}) {
  return body.creative_project_id || body.creativeProjectId || null;
}

function masterId(body = {}) {
  return body.right_master_asset_node_id || body.rightMasterAssetNodeId || null;
}

export async function POST(request) {
  try {
    const body = await request.json();
    const action = String(body.action || "inspect").trim().toLowerCase();
    const organizationId = body.organization_id || body.organizationId;
    const creativeProjectId = projectId(body);
    if (!organizationId || !creativeProjectId) {
      return Response.json(
        { success: false, error: "organization_id and creative_project_id required" },
        { status: 400 },
      );
    }

    const requiredPermission = action === "finalize"
      ? "creative.release.approve"
      : "creative.quality.evaluate";
    const access = await requireOrganizationAccess({
      organizationId,
      request,
      requiredPermission,
    });
    if (!access.success) return Response.json(access, { status: access.status });

    const input = {
      organization_id: organizationId,
      creative_project_id: creativeProjectId,
      right_master_asset_node_id: masterId(body),
    };
    const actor = {
      user_id: access.userId,
      staff_account_id: access.staff?.id,
      email: access.userEmail,
    };

    let result;
    if (action === "decide") {
      result = await CreativeMasterDeltaReviewRuntime.decide({
        ...input,
        change_key: body.change_key || body.changeKey,
        classification: body.classification,
        resolution_state: body.resolution_state || body.resolutionState || null,
        note: body.note || body.notes || "",
        annotation: body.annotation || null,
        actor,
      });
    } else if (action === "finalize") {
      result = await CreativeMasterDeltaReviewRuntime.finalize({
        ...input,
        notes: body.notes || "Revision changes reviewed and resolved in Video Mastering.",
        actor,
      });
    } else {
      result = await CreativeMasterDeltaReviewRuntime.inspect(input);
    }

    return Response.json({ success: true, result });
  } catch (error) {
    return Response.json(
      { success: false, error: error?.message || String(error) },
      { status: 500 },
    );
  }
}
