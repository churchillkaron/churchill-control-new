export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { checkFinancePermission } from "@/lib/shared/auth/checkFinancePermission";
import {
  updateAccountingPeriodStatusCommand,
} from "@/lib/finance/period-close/runtime/PeriodCloseApplicationService";

function required(value, field) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new Error(`${field} required`);
  return normalized;
}

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId = required(
      body.organizationId || body.organization_id,
      "organization_id"
    );

    const access = await requireOrganizationAccess({
      organizationId,
      request,
    });

    if (!access.success) {
      return NextResponse.json(
        {
          success: false,
          error: access.error,
        },
        {
          status: access.status,
        }
      );
    }

    const actorId = required(access.user?.id, "authenticated user");

    await checkFinancePermission({
      organizationId: access.organizationId,
      userId: actorId,
      permissionKey: "finance.close.execute",
      fullAccess: access.permissions?.includes("*") === true,
    });

    const result = await updateAccountingPeriodStatusCommand({
      organizationId: access.organizationId,
      periodId: required(body.periodId || body.period_id, "period_id"),
      status: required(body.status, "status"),
      userId: actorId,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error.message || "Accounting period update failed";
    const status = /permission denied|authentication|membership/i.test(message)
      ? 403
      : /required/i.test(message)
        ? 400
        : 500;

    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      {
        status,
      }
    );
  }
}
