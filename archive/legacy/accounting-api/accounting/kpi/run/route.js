import { NextResponse } from "next/server";

import { runAccountingKPIs } from "@/lib/finance/core/runAccountingKPIs";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const kpis =
      await runAccountingKPIs({
        tenantId:
          body.tenantId,
        startDate:
          body.startDate,
        endDate:
          body.endDate,
      });

    return NextResponse.json({
      success: true,
      kpis,
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
