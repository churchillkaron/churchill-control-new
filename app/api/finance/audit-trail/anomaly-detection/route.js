import { NextResponse } from "next/server";

import { runFinanceAnomalyDetection } from "@/lib/intelligence/finance/runFinanceAnomalyDetection";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const anomalies =
      await runFinanceAnomalyDetection({
        tenantId:
          body.tenantId,
      });

    return NextResponse.json({
      success: true,
      anomalies,
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
