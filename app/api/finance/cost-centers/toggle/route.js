export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { setFinanceCostCenterActive } from "@/lib/finance/cost-centers/CostCenterPolicy";

export async function POST(request) {
  try {
    const body = await request.json();
    const access = await requireOrganizationAccess({
      organizationId: body.organizationId || body.organization_id,
      request,
      requiredPermission: "finance.accounting.manage",
    });

    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error },
        { status: access.status }
      );
    }

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
    return NextResponse.json(
      { success: false, error: message },
      { status: /required|not found|child|first/i.test(message) ? 400 : 500 }
    );
  }
}
