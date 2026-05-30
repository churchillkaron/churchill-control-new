import { NextResponse } from "next/server";

import { runAIOptimizationEngine } from "@/lib/finance/core/runAIOptimizationEngine";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const optimizations =
      await runAIOptimizationEngine({
        tenantId:
          body.tenantId,
      });

    return NextResponse.json({
      success: true,
      optimizations,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message:
          error.message,
      },
      {
        status: 400,
      }
    );
  }
}
