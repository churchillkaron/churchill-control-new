import { NextResponse } from "next/server";

import { runCloseChecklist } from "@/lib/finance/core/runCloseChecklist";

export async function POST(request) {
  try {
    const body = await request.json();

    const checklist =
      await runCloseChecklist({
        tenantId: body.tenantId,
        accountingPeriodId:
          body.accountingPeriodId,
      });

    return NextResponse.json({
      success: true,
      checklist,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: error.message,
      },
      {
        status: 400,
      }
    );
  }
}
