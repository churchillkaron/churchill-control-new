import { NextResponse } from "next/server";
import { createAccountingPeriod } from "@/lib/finance/createAccountingPeriod";

export async function POST(request) {
  try {
    const body = await request.json();

    const period = await createAccountingPeriod(body);

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
