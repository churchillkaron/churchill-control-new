import { NextResponse } from "next/server";

import { createBudgetPlan } from "@/lib/finance/core/createBudgetPlan";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const budget =
      await createBudgetPlan({
        tenantId:
          body.tenantId,
        budgetName:
          body.budgetName,
        budgetPeriod:
          body.budgetPeriod,
        department:
          body.department,
        plannedRevenue:
          body.plannedRevenue,
        plannedExpenses:
          body.plannedExpenses,
      });

    return NextResponse.json({
      success: true,
      budget,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message:
          error.message,
      },
      {
        status: 400,
      }
    );
  }
}
