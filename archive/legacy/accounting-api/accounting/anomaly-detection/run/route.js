import { NextResponse } from "next/server";

import { runAnomalyDetection } from "@/lib/finance/core/runAnomalyDetection";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const anomalies =
      await runAnomalyDetection({
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
