import { NextResponse } from "next/server";
import { runRiskAnalysis } from "@/lib/finance/runRiskAnalysis";

export async function POST(request) {
  try {
    const body = await request.json();

    const risks = await runRiskAnalysis({
      tenantId: body.tenantId,
    });

    return NextResponse.json({
      success: true,
      risks,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      message: error.message,
    }, { status: 400 });
  }
}
