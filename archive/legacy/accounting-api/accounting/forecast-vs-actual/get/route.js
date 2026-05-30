import { NextResponse } from "next/server";
import { getForecastVsActual } from "@/lib/finance/executive/getForecastVsActual";

export async function POST(request) {
  try {
    const body = await request.json();

    const report = await getForecastVsActual({
      tenantId: body.tenantId,
    });

    return NextResponse.json({
      success: true,
      report,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      message: error.message,
    }, { status: 400 });
  }
}
