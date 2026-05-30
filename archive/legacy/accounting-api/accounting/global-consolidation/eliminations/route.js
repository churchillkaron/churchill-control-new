import { NextResponse } from "next/server";

import { runConsolidationElimination } from "@/lib/finance/core/runConsolidationElimination";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const elimination =
      await runConsolidationElimination({
        tenantId:
          body.tenantId,
        eliminationType:
          body.eliminationType,
        sourceEntity:
          body.sourceEntity,
        targetEntity:
          body.targetEntity,
        eliminationAmount:
          body.eliminationAmount,
      });

    return NextResponse.json({
      success: true,
      elimination,
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
