import { NextResponse } from "next/server";

import { runAccountingRecommendations } from "@/lib/finance/core/runAccountingRecommendations";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const recommendations =
      await runAccountingRecommendations({
        tenantId:
          body.tenantId,
      });

    return NextResponse.json({
      success: true,
      recommendations,
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
