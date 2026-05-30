import { NextResponse } from "next/server";
import { runCapitalPlanning } from "@/lib/finance/enterprise/runCapitalPlanning";

export async function GET() {
  try {
    const plans = await runCapitalPlanning();

    return NextResponse.json({
      success: true,
      plans,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      message: error.message,
    }, { status: 400 });
  }
}
