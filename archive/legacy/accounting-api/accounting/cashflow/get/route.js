import { NextResponse } from "next/server";
import { getCashflowSummary } from "@/lib/finance/getCashflowSummary";

export async function POST(request) {
  try {
    const body = await request.json();

    const summary = await getCashflowSummary({
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
