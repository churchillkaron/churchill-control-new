import { NextResponse } from "next/server";
import { validateAccountingPeriod } from "@/lib/finance/core/validateAccountingPeriod";

export async function POST(request) {
  try {
    const body = await request.json();

    const period = await validateAccountingPeriod({
      tenantId: body.tenantId,
      entryDate: body.entryDate,
    });

    return NextResponse.json({
      success: true,
      period,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      message: error.message,
    }, { status: 400 });
  }
}
