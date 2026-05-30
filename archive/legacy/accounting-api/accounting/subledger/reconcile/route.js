import { NextResponse } from "next/server";

import { runSubledgerReconciliation } from "@/lib/finance/core/runSubledgerReconciliation";

export async function POST(request) {
  try {
    const body = await request.json();

    const reconciliation =
      await runSubledgerReconciliation({
        tenantId: body.tenantId,
        controlType: body.controlType,
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
