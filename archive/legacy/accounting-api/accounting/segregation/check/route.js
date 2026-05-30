import { NextResponse } from "next/server";
import { runSegregationChecks } from "@/lib/finance/governance/runSegregationChecks";

export async function GET() {
  try {
    const checks = await runSegregationChecks();

    return NextResponse.json({
      success: true,
      checks,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      message: error.message,
    }, { status: 400 });
  }
}
