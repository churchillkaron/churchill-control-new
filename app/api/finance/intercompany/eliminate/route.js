import { NextResponse } from "next/server";

import { runIntercompanyElimination } from "@/lib/finance/intercompany/runIntercompanyElimination";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const elimination =
      await runIntercompanyElimination({
        tenantId:
          body.tenantId,
        reconciliationId:
          body.reconciliationId,
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
