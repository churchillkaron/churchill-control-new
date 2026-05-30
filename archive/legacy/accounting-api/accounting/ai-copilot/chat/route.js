import { NextResponse } from "next/server";
import { accountingAICopilot } from "@/lib/finance/accountingAICopilot";

export async function POST(request) {
  try {
    const body = await request.json();

    const response = await accountingAICopilot({
      tenantId: body.tenantId,
      message: body.message,
    });

    return NextResponse.json({
      success: true,
      response,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      message: error.message,
    }, { status: 400 });
  }
}
