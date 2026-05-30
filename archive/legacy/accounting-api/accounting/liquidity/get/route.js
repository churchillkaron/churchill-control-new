import { NextResponse } from "next/server";
import { getLiquidityMetrics } from "@/lib/finance/analytics/getLiquidityMetrics";

export async function POST(request) {
  try {
    const body = await request.json();

    const metrics = await getLiquidityMetrics({
      tenantId: body.tenantId,
    });

    return NextResponse.json({
      success: true,
      metrics,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      message: error.message,
    }, { status: 400 });
  }
}
