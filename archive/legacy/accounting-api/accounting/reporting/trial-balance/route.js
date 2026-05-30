import { NextResponse } from "next/server";
import { generateTrialBalance } from "@/lib/finance/reporting/generateTrialBalance";

export async function POST(request) {
  try {
    const body = await request.json();

    const report = await generateTrialBalance({
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
