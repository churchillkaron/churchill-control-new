import { NextResponse } from "next/server";

import { runAutonomousFinanceActions } from "@/lib/finance/core/runAutonomousFinanceActions";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const actions =
      await runAutonomousFinanceActions({
        tenantId:
          body.tenantId,
      });

    return NextResponse.json({
      success: true,
      actions,
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
