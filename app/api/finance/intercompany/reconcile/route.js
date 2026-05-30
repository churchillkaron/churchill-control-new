import { NextResponse } from "next/server";

import { runIntercompanyReconciliation } from "@/lib/finance/core/runIntercompanyReconciliation";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const reconciliation =
      await runIntercompanyReconciliation({
        tenantId:
          body.tenantId,
        transactionId:
          body.transactionId,
        sourceBalance:
          body.sourceBalance,
        targetBalance:
          body.targetBalance,
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
