import { NextResponse } from "next/server";

import { runLaborCosting } from "@/lib/finance/core/runLaborCosting";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const result =
      await runLaborCosting({
        tenantId:
          body.tenantId,
        department:
          body.department,
        laborHours:
          body.laborHours,
        averageHourlyRate:
          body.averageHourlyRate,
        revenueGenerated:
          body.revenueGenerated,
      });

    return NextResponse.json({
      success: true,
      result,
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
