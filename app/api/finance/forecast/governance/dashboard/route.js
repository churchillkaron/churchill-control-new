export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { checkFinancePermission } from "@/lib/shared/auth/checkFinancePermission";
import { buildForecastGovernanceDashboardReportCommand } from "@/lib/finance/budgeting/runtime/BudgetApplicationService";

function statusFor(error) {
  const message = String(error?.message || "").toLowerCase();
  if (message.includes("permission denied")) return 403;
  if (/required|invalid/i.test(message)) return 400;
  return error?.status || 500;
}

async function canManage(access) {
  try {
    await checkFinancePermission({
      organizationId: access.organizationId,
      userId: access.user?.id,
      permissionKey: "finance.accounting.manage",
      fullAccess: access.permissions?.includes("*") === true,
    });
    return true;
  } catch (error) {
    if (String(error?.message || "").toLowerCase().includes("permission denied")) return false;
    throw error;
  }
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

    const result = await buildForecastGovernanceDashboardReportCommand({
      organizationId: access.organizationId,
      limit: searchParams.get("limit") || undefined,
    });

    return NextResponse.json({ ...result, can_manage: await canManage(access) });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Forecast governance dashboard failed",
      },
      { status: statusFor(error) }
    );
  }
}
