import { NextResponse } from "next/server";

import { runBankReconciliation } from "@/lib/finance/core/runBankReconciliation";

export async function POST(request) {
  try {
    const body = await request.json();

    const reconciliation =
      await runBankReconciliation({
        tenantId: body.tenantId,
        bankAccountId: body.bankAccountId,
      });

    return NextResponse.json({
      success: true,
      reconciliation,
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
