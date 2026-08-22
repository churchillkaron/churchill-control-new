export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { checkFinancePermission } from "@/lib/shared/auth/checkFinancePermission";
import {
  openAccountingPeriodCommand,
} from "@/lib/finance/period-close/runtime/PeriodCloseApplicationService";

function statusFor(message) {
  if (/permission denied|authentication|membership/i.test(String(message || ""))) return 403;
  if (/required|period|date|overlap|entity|invalid/i.test(String(message || ""))) return 400;
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

    const actorId = access.user?.id;
    if (!actorId) throw new Error("Authenticated user required");

    await checkFinancePermission({
      organizationId: access.organizationId,
      userId: actorId,
      permissionKey: "finance.close.execute",
      fullAccess: access.permissions?.includes("*") === true,
    });

    const result = await openAccountingPeriodCommand({
      organizationId: access.organizationId,
      entityId: body.entityId || body.entity_id || null,
      name: body.name,
      startDate: body.start_date || body.startDate,
      endDate: body.end_date || body.endDate,
      createdBy: actorId,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error?.message || "Accounting period creation failed";
    return NextResponse.json(
      { success: false, error: message },
      { status: statusFor(message) }
    );
  }
}
