export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { checkFinancePermission } from "@/lib/shared/auth/checkFinancePermission";
import { createBudgetDocument } from "@/lib/finance/budgeting/runtime/BudgetApplicationService";

function statusFor(error) {
  const message = String(error?.message || "").toLowerCase();
  if (message.includes("permission denied")) return 403;
  if (/required|invalid/i.test(message)) return 400;
  return error?.status || 500;
}

export async function POST(request) {
  try {
    const body = await request.json();
    const access = await requireOrganizationAccess({
      organizationId:
        body.organizationId ||
        body.organization_id,
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
      permissionKey: "finance.accounting.manage",
      fullAccess: access.permissions?.includes("*") === true,
    });

    const budget = await createBudgetDocument({
      organization_id: access.organizationId,
      entity_id: body.entityId || body.entity_id,
      period_id: body.periodId || body.period_id,
      currency_code:
        body.currencyCode ||
        body.currency_code ||
        body.currency,
      category: body.category,
      amount: body.amount,
    });

    return NextResponse.json({
      success: true,
      data: budget,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Budget creation failed",
      },
      { status: statusFor(error) }
    );
  }
}
