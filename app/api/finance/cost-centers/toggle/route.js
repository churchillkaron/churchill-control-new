export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { requireFinanceWorkspacePermission } from "@/lib/finance/workspaces/FinanceWorkspacePermissionPolicy";
import { setFinanceCostCenterActive } from "@/lib/finance/cost-centers/CostCenterPolicy";

export async function POST(request) {
  try {
    const body = await request.json();
    const access = await requireOrganizationAccess({
      organizationId: body.organizationId || body.organization_id,
      request,
    });

    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error },
        { status: access.status }
      );
    }

    await requireFinanceWorkspacePermission({
      capabilityId: "cost_centers",
      operation: "write",
      access,
    });

    const costCenterId = body.cost_center_id || body.costCenterId || body.id;
    const desired =
      body.is_active !== undefined
        ? Boolean(body.is_active)
        : body.active !== undefined
          ? Boolean(body.active)
          : false;

    const result = await setFinanceCostCenterActive({
      organizationId: access.organizationId,
      costCenterId,
      isActive: desired,
      actorId: access.user?.id || access.userId,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error?.message || "Cost Centre status update failed";
    const status = /permission denied/i.test(message)
      ? 403
      : /required|not found|child|first/i.test(message)
        ? 400
        : 500;
    return NextResponse.json(
      { success: false, error: message },
      { status }
    );
  }
}
