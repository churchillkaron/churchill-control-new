import { NextResponse } from "next/server";
import { getProfitLoss } from "@/lib/finance/getProfitLoss";

export async function POST(request) {
  try {
    const body = await request.json();

    const report = await getProfitLoss({
      tenantId: body.tenantId,
      startDate: body.startDate,
      endDate: body.endDate,
    });

    return NextResponse.json({
      success: true,
      report,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: error.message,
      },
      { status: 400 }
    );
  }
}
