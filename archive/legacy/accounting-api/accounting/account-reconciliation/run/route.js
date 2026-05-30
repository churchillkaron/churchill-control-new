import { NextResponse } from "next/server";

import { runAccountReconciliation } from "@/lib/finance/core/runAccountReconciliation";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const reconciliation =
      await runAccountReconciliation({
        tenantId:
          body.tenantId,
        accountCode:
          body.accountCode,
        sourceBalance:
          body.sourceBalance,
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
