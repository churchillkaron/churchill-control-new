import { NextResponse } from "next/server";

import { runCashReconciliation } from "@/lib/finance/core/runCashReconciliation";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const reconciliation =
      await runCashReconciliation({
        tenantId:
          body.tenantId,
        bankBalance:
          body.bankBalance,
      });

    return NextResponse.json({
      success: true,
      reconciliation,
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
