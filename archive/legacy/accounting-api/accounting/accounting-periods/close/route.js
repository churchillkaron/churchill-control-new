import { NextResponse } from "next/server";
import { closeAccountingPeriod } from "@/lib/finance/closeAccountingPeriod";

export async function POST(request) {
  try {
    const body = await request.json();

    const period = await closeAccountingPeriod(body.periodId);

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
