import { NextResponse } from "next/server";

import { getBudgetVariance } from "@/lib/finance/core/getBudgetVariance";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const variance =
      await getBudgetVariance({
        tenantId:
          body.tenantId,
        budgetId:
          body.budgetId,
        startDate:
          body.startDate,
        endDate:
          body.endDate,
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
