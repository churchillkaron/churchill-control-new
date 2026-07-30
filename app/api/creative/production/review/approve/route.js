export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";
import {
  CreativeProductionTaskReviewRuntime,
} from "@/lib/creative/production/review/runtime/CreativeProductionTaskReviewRuntime";

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId = body.organization_id || body.organizationId;
    const taskId = body.task_id || body.taskId;

    if (!organizationId || !taskId) {
      return Response.json(
        {
          success: false,
          error: "organization_id and task_id required",
        },
        { status: 400 },
      );
    }

    const access = await requireOrganizationAccess({
      organizationId,
      request,
      requiredPermission: "creative.release.approve",
    });
    if (!access.success) {
      return Response.json(access, { status: access.status });
    }

    const result = await CreativeProductionTaskReviewRuntime.approve({
      organization_id: organizationId,
      task_id: taskId,
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
