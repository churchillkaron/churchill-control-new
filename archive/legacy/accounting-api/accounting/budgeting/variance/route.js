import { NextResponse } from "next/server";

import { runBudgetVariance } from "@/lib/finance/core/runBudgetVariance";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const variance =
      await runBudgetVariance({
        tenantId:
          body.tenantId,
        budgetId:
          body.budgetId,
        actualRevenue:
          body.actualRevenue,
        actualExpenses:
          body.actualExpenses,
      });

    return NextResponse.json({
      success: true,
      variance,
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
