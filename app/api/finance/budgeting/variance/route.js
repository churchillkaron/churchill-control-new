export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { calculateBudgetVarianceCommand } from "@/lib/finance/budgeting/runtime/BudgetApplicationService";

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);

    const access = await requireOrganizationAccess({
      organizationId: searchParams.get("organizationId"),
    });

    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error },
        { status: access.status }
      );
    }

    const result = await calculateBudgetVarianceCommand({
      organizationId: access.organizationId,
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
