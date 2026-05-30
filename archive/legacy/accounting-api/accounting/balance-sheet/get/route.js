import { NextResponse } from "next/server";
import { getBalanceSheet } from "@/lib/finance/getBalanceSheet";

export async function POST(request) {
  try {
    const body = await request.json();

    const report = await getBalanceSheet({
      tenantId: body.tenantId,
    });

    return NextResponse.json({
      success: true,
      report,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: error.message,
      },
      { status: 400 }
    );
  }
}
