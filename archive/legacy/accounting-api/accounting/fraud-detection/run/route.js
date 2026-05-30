import { NextResponse } from "next/server";
import { runFraudDetection } from "@/lib/finance/runFraudDetection";

export async function POST(request) {
  try {
    const body = await request.json();

    const logs = await runFraudDetection({
      tenantId: body.tenantId,
    });

    return NextResponse.json({
      success: true,
      logs,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      message: error.message,
    }, { status: 400 });
  }
}
