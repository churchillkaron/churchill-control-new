export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { listBudgetsCommand } from "@/lib/finance/budgeting/runtime/BudgetApplicationService";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);

    const access = await requireOrganizationAccess({
      organizationId: searchParams.get("organizationId"),
    });

    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error },
        { status: access.status }
      );
    }

    const result = await listBudgetsCommand({
      organization_id: access.organizationId,
    });

    return NextResponse.json({
      success: true,
      budgets: result.data,
    });

  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
