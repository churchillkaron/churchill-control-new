export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/shared/auth";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import createCostCenter from "@/lib/finance/cost-centers/createCostCenter";

export async function POST(request) {
  try {
    await requireAuth();
    const body = await request.json();

    const access = await requireOrganizationAccess({
      organizationId:
        body.organizationId || body.organization_id,
      request,
      requiredPermission: "finance.accounting.manage",
    });

    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error },
        { status: access.status }
      );
    }

    const result = await createCostCenter({
      organization_id: access.organizationId,
      entity_id: body.entity_id || body.entityId || null,
      name: body.name,
      code: body.code,
      type: body.type,
      parent_cost_center_id:
        body.parent_cost_center_id || body.parentCostCenterId || null,
      manager: body.manager || null,
      is_active:
        body.is_active === undefined
          ? true
          : Boolean(body.is_active),
    });

    if (!result.success) {
      const message = result.error || "Cost Centre creation failed";
      const status = /required|exists|outside|inactive|not supported/i.test(
        message
      )
        ? 400
        : 500;

      return NextResponse.json(result, { status });
    }

    return NextResponse.json(result);
  } catch (error) {
    const message = error?.message || "Cost Centre creation failed";

    return NextResponse.json(
      { success: false, error: message },
      {
        status: /required|access|permission/i.test(message)
          ? 400
          : 500,
      }
    );
  }
}
