export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";
import {
  CreativeEditReviewRuntime,
} from "@/lib/creative/review/runtime/CreativeEditReviewRuntime";

function projectId(body = {}) {
  return body.creative_project_id || body.creativeProjectId || null;
}

function timelineId(body = {}) {
  return body.timeline_asset_node_id || body.timelineAssetNodeId || null;
}

async function accessFor(request, body, permission) {
  const organizationId = body.organization_id || body.organizationId;
  const access = await requireOrganizationAccess({
    organizationId,
    request,
    requiredPermission: permission,
  });
  return { organizationId, access };
}

export async function POST(request) {
  try {
    const body = await request.json();
    const action = String(body.action || "inspect").trim().toLowerCase();
    const permission = ["comment", "resolve"].includes(action)
      ? "creative.quality.evaluate"
      : action === "approve"
        ? "creative.release.approve"
        : "creative.quality.evaluate";
    const { organizationId, access } = await accessFor(request, body, permission);
    if (!access.success) return Response.json(access, { status: access.status });

    const input = {
      organization_id: organizationId,
      creative_project_id: projectId(body),
    };
    if (!input.organization_id || !input.creative_project_id) {
      return Response.json(
        { success: false, error: "organization_id and creative_project_id required" },
        { status: 400 },
      );
    }

    let result;
    if (action === "prepare") {
      result = await CreativeEditReviewRuntime.prepare(input);
    } else if (action === "comment") {
      result = await CreativeEditReviewRuntime.comment({
        ...input,
        timeline_asset_node_id: timelineId(body),
        body: body.body || body.comment || "",
        timecode_seconds: body.timecode_seconds ?? body.timecodeSeconds ?? 0,
        annotation: body.annotation || null,
        actor: {
          user_id: access.userId,
          staff_account_id: access.staff?.id,
          email: access.userEmail,
        },
      });
    } else if (action === "resolve") {
      result = await CreativeEditReviewRuntime.resolve({
        ...input,
        comment_asset_node_id:
          body.comment_asset_node_id || body.commentAssetNodeId,
        actor: {
          user_id: access.userId,
          staff_account_id: access.staff?.id,
          email: access.userEmail,
        },
      });
    } else if (action === "approve") {
      result = await CreativeEditReviewRuntime.approve({
        ...input,
        timeline_asset_node_id: timelineId(body),
        notes: body.notes || "Approved in Video Studio Review after cut review.",
        actor: {
          user_id: access.userId,
          staff_account_id: access.staff?.id,
          email: access.userEmail,
        },
      });
    } else {
      result = await CreativeEditReviewRuntime.inspect(input);
    }

    return Response.json({ success: true, result });
  } catch (error) {
    return Response.json(
      { success: false, error: error?.message || String(error) },
      { status: 500 },
    );
  }
}
