import { NextResponse } from "next/server";

import { runSubledgerReconciliation } from "@/lib/finance/core/runSubledgerReconciliation";

export async function POST(request) {
  try {
    const body = await request.json();

    const result =
      await runSubledgerReconciliation({
        tenantId: body.tenantId,
        controlType: body.controlType,
      });

    return NextResponse.json({
      success: true,
      result,
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
