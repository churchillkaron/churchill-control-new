import { NextResponse } from "next/server";
import { runCostAllocation } from "@/lib/finance/strategy/runCostAllocation";

export async function POST(request) {
  try {
    const body = await request.json();

    const allocations = await runCostAllocation({
      tenantId: body.tenantId,
    });

    return NextResponse.json({
      success: true,
      allocations,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      message: error.message,
    }, { status: 400 });
  }
}
