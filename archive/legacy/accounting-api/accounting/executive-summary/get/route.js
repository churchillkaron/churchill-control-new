import { NextResponse } from "next/server";
import { getExecutiveFinancialSummary } from "@/lib/finance/getExecutiveFinancialSummary";

export async function POST(request) {
  try {
    const body = await request.json();

    const summary = await getExecutiveFinancialSummary({
      tenantId: body.tenantId,
    });

    return NextResponse.json({
      success: true,
      summary,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      message: error.message,
    }, { status: 400 });
  }
}
