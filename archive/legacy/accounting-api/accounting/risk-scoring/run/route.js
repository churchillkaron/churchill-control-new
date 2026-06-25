import { NextResponse } from "next/server";

import { runRiskScoring } from "@/lib/finance/analytics/runRiskScoring";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const score =
      await runRiskScoring({
        tenantId:
          body.tenantId,
      });

    return NextResponse.json({
      success: true,
      score,
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
