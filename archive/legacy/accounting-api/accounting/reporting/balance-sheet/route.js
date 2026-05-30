import { NextResponse } from "next/server";
import { generateBalanceSheet } from "@/lib/finance/reporting/generateBalanceSheet";

export async function POST(request) {
  try {
    const body = await request.json();

    const report = await generateBalanceSheet({
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
