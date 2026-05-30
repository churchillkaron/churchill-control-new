import { NextResponse } from "next/server";

import { runGlobalConsolidation } from "@/lib/finance/core/runGlobalConsolidation";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const consolidation =
      await runGlobalConsolidation({
        tenantId:
          body.tenantId,
        consolidationPeriod:
          body.consolidationPeriod,
      });

    return NextResponse.json({
      success: true,
      consolidation,
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
