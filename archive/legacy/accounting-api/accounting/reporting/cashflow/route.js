import { NextResponse } from "next/server";
import { generateCashflow } from "@/lib/finance/reporting/generateCashflow";

export async function POST(request) {
  try {
    const body = await request.json();

    const report = await generateCashflow({
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
