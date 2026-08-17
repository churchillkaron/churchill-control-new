export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { checkFinancePermission } from "@/lib/shared/auth/checkFinancePermission";
import { buildForecastGovernanceAuditPackCommand } from "@/lib/finance/budgeting/runtime/BudgetApplicationService";

function statusFor(error) {
  const message = String(error?.message || "").toLowerCase();
  if (message.includes("permission denied")) return 403;
  if (/required|invalid/i.test(message)) return 400;
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

    const result = await buildForecastGovernanceAuditPackCommand({
      organizationId: access.organizationId,
      entityId: searchParams.get("entityId") || searchParams.get("entity_id") || null,
      versionId: searchParams.get("versionId") || searchParams.get("version_id") || null,
    });

    return NextResponse.json(result, {
      headers: {
        "Cache-Control": "no-store",
        "Content-Disposition": `attachment; filename="forecast-governance-audit-pack-${access.organizationId}.json"`,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Forecast governance audit pack failed",
      },
      { status: statusFor(error) }
    );
  }
}
