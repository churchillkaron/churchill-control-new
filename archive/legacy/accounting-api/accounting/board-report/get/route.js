import { NextResponse } from "next/server";
import { getBoardReport } from "@/lib/finance/strategy/getBoardReport";

export async function POST(request) {
  try {
    const body = await request.json();

    const report = await getBoardReport({
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
