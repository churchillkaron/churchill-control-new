import { NextResponse } from "next/server";
import { getAIInsights } from "@/lib/finance/getAIInsights";

export async function POST(request) {
  try {
    const body = await request.json();

    const insights = await getAIInsights({
      tenantId: body.tenantId,
    });

    return NextResponse.json({
      success: true,
      insights,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      message: error.message,
    }, { status: 400 });
  }
}
