import { NextResponse } from "next/server";

import { getDashboardSummary } from "@/lib/finance/core/getDashboardSummary";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const summary =
      await getDashboardSummary({
        tenantId:
          body.tenantId,
      });

    return NextResponse.json({
      success: true,
      summary,
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
