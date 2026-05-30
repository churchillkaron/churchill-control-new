import { NextResponse } from "next/server";

import { runItemProfitability } from "@/lib/finance/core/runItemProfitability";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const profitability =
      await runItemProfitability({
        tenantId:
          body.tenantId,
        itemId:
          body.itemId,
      });

    return NextResponse.json({
      success: true,
      profitability,
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
