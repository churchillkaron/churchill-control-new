import { NextResponse } from "next/server";

import { allocateLaborCost } from "@/lib/payroll/core/allocateLaborCost";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const allocation =
      await allocateLaborCost({
        tenantId:
          body.tenantId,
        shiftName:
          body.shiftName,
        department:
          body.department,
        laborCost:
          body.laborCost,
        revenue:
          body.revenue,
      });

    return NextResponse.json({
      success: true,
      allocation,
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
