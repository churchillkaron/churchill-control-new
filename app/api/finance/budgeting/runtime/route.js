export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { listBudgetsCommand } from "@/lib/finance/budgeting/runtime/BudgetApplicationService";

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

    const result = await listBudgetsCommand({
      organizationId: access.organizationId,
      entityId:
        searchParams.get("entityId") ||
        searchParams.get("entity_id"),
      periodId:
        searchParams.get("periodId") ||
        searchParams.get("period_id") ||
        null,
    });

    return NextResponse.json({
      success: true,
      rows: result.data,
      budgets: result.data,
    });
  } catch (error) {
    const message = error.message || "Budget load failed";
    return NextResponse.json(
      { success: false, error: message, rows: [] },
      { status: /required|not found/i.test(message) ? 400 : 500 }
    );
  }
}
