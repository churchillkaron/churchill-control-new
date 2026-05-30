import { NextResponse } from "next/server";
import { runScenarioPlanning } from "@/lib/finance/strategy/runScenarioPlanning";

export async function POST(request) {
  try {
    const body = await request.json();

    const scenarios = await runScenarioPlanning({
      tenantId: body.tenantId,
    });

    return NextResponse.json({
      success: true,
      scenarios,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      message: error.message,
    }, { status: 400 });
  }
}
