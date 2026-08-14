export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { resolveEntity } from "@/lib/platform/entities/resolveEntity";
import { checkFinancePermission } from "@/lib/shared/auth/checkFinancePermission";
import {
  buildRevenueForecastCommand,
} from "@/lib/finance/reporting/runtime/ReportingApplicationService";

function statusFor(message) {
  const normalized = String(message || "").toLowerCase();
  if (normalized.includes("permission denied")) return 403;
  if (/required|invalid/i.test(normalized)) return 400;
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

    const result = await buildRevenueForecastCommand({
      ...body,
      organizationId: access.organizationId,
      organization_id: access.organizationId,
      entityId: requestedEntityId,
      entity_id: requestedEntityId,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error.message || "Forecast failed";
    return NextResponse.json(
      { success: false, error: message },
      { status: statusFor(message) }
    );
  }
}
