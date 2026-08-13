export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { checkFinancePermission } from "@/lib/shared/auth/checkFinancePermission";
import { createBudgetDocument } from "@/lib/finance/budgeting/runtime/BudgetApplicationService";

function statusFor(error) {
  const message = String(error?.message || "").toLowerCase();
  if (message.includes("permission denied")) return 403;
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
      category: body.category,
      amount: body.amount,
      month: body.month,
      year: body.year,
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
