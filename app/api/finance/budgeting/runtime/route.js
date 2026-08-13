export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { checkFinancePermission } from "@/lib/shared/auth/checkFinancePermission";
import { listBudgetsCommand } from "@/lib/finance/budgeting/runtime/BudgetApplicationService";

function statusFor(error) {
  const message = String(error?.message || "").toLowerCase();
  if (message.includes("permission denied")) return 403;
  return error?.status || 500;
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const access = await requireOrganizationAccess({
      organizationId:
        searchParams.get("organizationId") ||
        searchParams.get("organization_id"),
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

    const budgets = await listBudgetsCommand({
      organization_id: access.organizationId,
    });

    return NextResponse.json({
      success: true,
      budgets,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Budget load failed",
      },
      { status: statusFor(error) }
    );
  }
}
