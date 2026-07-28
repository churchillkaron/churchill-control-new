export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { resolveEntity } from "@/lib/platform/entities/resolveEntity";
import { calculateBudgetVarianceCommand } from "@/lib/finance/budgeting/runtime/BudgetApplicationService";

function queryValue(searchParams, camel, snake) {
  return searchParams.get(camel) || searchParams.get(snake) || null;
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const access = await requireOrganizationAccess({
      organizationId: queryValue(searchParams, "organizationId", "organization_id"),
      request,
    });

    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error, rows: [] },
        { status: access.status }
      );
    }

    const requestedEntityId = queryValue(searchParams, "entityId", "entity_id");
    const periodId = queryValue(searchParams, "periodId", "period_id");
    if (!requestedEntityId) throw new Error("entity_id required");
    if (!periodId) throw new Error("period_id required");

    const entity = await resolveEntity({
      organizationId: access.organizationId,
      entityId: requestedEntityId,
    });
    if (!entity) throw new Error("Legal entity not found in organisation");

    const result = await calculateBudgetVarianceCommand({
      organizationId: access.organizationId,
      entityId: entity.id,
      periodId,
      startDate: queryValue(searchParams, "startDate", "start_date"),
      endDate: queryValue(searchParams, "endDate", "end_date"),
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error.message || "Budget variance load failed";
    return NextResponse.json(
      { success: false, error: message, rows: [] },
      { status: /required|not found|period|entity/i.test(message) ? 400 : 500 }
    );
  }
}
