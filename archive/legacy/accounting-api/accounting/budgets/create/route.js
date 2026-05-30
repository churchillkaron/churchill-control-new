import { NextResponse } from "next/server";

import { createBudget } from "@/lib/finance/core/createBudget";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const result =
      await createBudget({
        tenantId:
          body.tenantId,
        budgetName:
          body.budgetName,
        fiscalYear:
          body.fiscalYear,
        lines:
          body.lines || [],
      });

    return NextResponse.json({
      success: true,
      result,
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
