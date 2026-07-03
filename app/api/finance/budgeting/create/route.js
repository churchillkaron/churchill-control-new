export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { createBudgetDocument } from "@/lib/finance/budgeting/runtime/BudgetApplicationService";

export async function POST(req) {
  try {
    const body = await req.json();

    const access = await requireOrganizationAccess({
      organizationId: body.organizationId,
    });

    if (!access.success) {
      return NextResponse.json(
        {
          success: false,
          error: access.error,
        },
        {
          status: access.status,
        }
      );
    }

    const budget = await createBudgetDocument({
      organizationId: access.organizationId,
      category: body.category,
      amount: body.amount,
      month: body.month,
      year: body.year,
      createdBy: body.userId || "system",
    });

    return NextResponse.json({
      success: true,
      data: budget,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      {
        status: 500,
      }
    );
  }
}
