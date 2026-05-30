import { NextResponse } from "next/server";

import { runProfitabilityEngine } from "@/lib/finance/core/runProfitabilityEngine";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const snapshot =
      await runProfitabilityEngine({
        tenantId:
          body.tenantId,
        referenceType:
          body.referenceType,
        referenceId:
          body.referenceId,
        revenue:
          body.revenue,
        cogs:
          body.cogs,
        laborCost:
          body.laborCost,
        overheadCost:
          body.overheadCost,
      });

    return NextResponse.json({
      success: true,
      snapshot,
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
