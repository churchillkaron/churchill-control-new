export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { resolveEntity } from "@/lib/platform/entities/resolveEntity";
import { checkFinancePermission } from "@/lib/shared/auth/checkFinancePermission";
import {
  buildForecastScenariosCommand,
} from "@/lib/finance/reporting/runtime/ReportingApplicationService";

function statusFor(message) {
  const normalized = String(message || "").toLowerCase();
  if (normalized.includes("permission denied")) return 403;
  if (/required|invalid|at least -100/i.test(normalized)) return 400;
  return 500;
}

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

    await checkFinancePermission({
      organizationId: access.organizationId,
      userId: access.user?.id,
      permissionKey: "finance.accounting.view",
      fullAccess: access.permissions?.includes("*") === true,
    });

    const requestedEntityId =
      body.entityId ||
      body.entity_id ||
      null;

    if (requestedEntityId) {
      const entity = await resolveEntity({
        organizationId: access.organizationId,
        entityId: requestedEntityId,
      });

      if (!entity) {
        return NextResponse.json(
          {
            success: false,
            error: "Invalid entity for organization",
          },
          { status: 400 }
        );
      }
    }

    const result = await buildForecastScenariosCommand({
      organizationId: access.organizationId,
      organization_id: access.organizationId,
      entityId: requestedEntityId,
      entity_id: requestedEntityId,
      periodId: body.periodId || body.period_id || null,
      period_id: body.periodId || body.period_id || null,
      assumptions: body.assumptions,
    });

    return NextResponse.json(result, {
      status: result?.success === false
        ? statusFor(result?.error)
        : 200,
    });
  } catch (error) {
    const message = error.message || "Forecast scenario generation failed";
    return NextResponse.json(
      { success: false, error: message },
      { status: statusFor(message) }
    );
  }
}
