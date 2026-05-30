import { NextResponse } from "next/server";

import { calculateShiftPerformance } from "@/lib/payroll/core/calculateShiftPerformance";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const performance =
      await calculateShiftPerformance({
        tenantId:
          body.tenantId,
        shiftName:
          body.shiftName,
        department:
          body.department,
        revenue:
          body.revenue,
        laborHours:
          body.laborHours,
        orders:
          body.orders,
      });

    return NextResponse.json({
      success: true,
      performance,
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
