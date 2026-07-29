export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { upsertFinanceCostCenter } from "@/lib/finance/cost-centers/CostCenterPolicy";
import { applyCostCenterConfiguration } from "@/lib/finance/cost-centers/CostCenterConfiguration";

function failure(error) {
  const message = error?.message || "Cost Centre update failed";
  const status = /required|exists|outside|inactive|different|supported|cycle|owner|department|entity|code|name|cannot change|configuration/i.test(message)
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

    const entityId = body.entityId || body.entity_id || null;
    if (!entityId) {
      return NextResponse.json(
        { success: false, error: "Select an active Legal Entity in Business Context first" },
        { status: 400 }
      );
    }

    const configured = await applyCostCenterConfiguration({
      organizationId: access.organizationId,
      payload: {
        ...body,
        entityId: undefined,
        entity_id: undefined,
      },
      isCreate: false,
    });

    const result = await upsertFinanceCostCenter({
      organizationId: access.organizationId,
      entityId,
      payload: configured.payload,
      actorId: access.user?.id || access.userId,
    });

    return NextResponse.json({
      ...result,
      configuration: configured.configuration,
    });
  } catch (error) {
    return failure(error);
  }
}
