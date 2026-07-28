export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/shared/auth";
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
    const user = await requireAuth();
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

    const userId = required(user?.id || access.user?.id, "authenticated user");
    await checkFinancePermission({
      userId,
      permissionKey: "close_period",
    });

    const result = await updateAccountingPeriodStatusCommand({
      organizationId: access.organizationId,
      entityId: required(body.entityId || body.entity_id, "entity_id"),
      periodId: required(body.periodId || body.period_id, "period_id"),
      status: required(body.status, "status"),
      userId,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error.message || "Accounting period status update failed";
    const status = /required|invalid|not found|cannot|only be applied|permission denied/i.test(message)
      ? 400
      : 500;

    return NextResponse.json(
      { success: false, error: message },
      { status }
    );
  }
}
