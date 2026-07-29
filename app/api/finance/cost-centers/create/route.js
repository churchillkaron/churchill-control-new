export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { upsertFinanceCostCenter } from "@/lib/finance/cost-centers/CostCenterPolicy";

function failure(error) {
  const message = error?.message || "Cost Centre creation failed";
  const status = /required|exists|outside|inactive|different|supported|cycle|manager|department|entity|code|name/i.test(message)
    ? 400
    : 500;
  return NextResponse.json({ success: false, error: message }, { status });
}

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

    const result = await upsertFinanceCostCenter({
      organizationId: access.organizationId,
      payload: body,
      actorId: access.user?.id || access.userId,
    });

    return NextResponse.json(result);
  } catch (error) {
    return failure(error);
  }
}
