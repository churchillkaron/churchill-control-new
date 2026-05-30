import { NextResponse } from "next/server";
import { getStrategicInsights } from "@/lib/finance/strategy/getStrategicInsights";

export async function GET() {
  try {
    const insights = await getStrategicInsights();

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
