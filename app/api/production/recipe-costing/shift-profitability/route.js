import { NextResponse } from "next/server";

import { runShiftProfitability } from "@/lib/production/costing/capabilities/runShiftProfitability";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const result =
      await runShiftProfitability({
        organizationId:
          body.organizationId ||
          body.organization_id,
        entityId:
          body.entityId ||
          body.entity_id ||
          null,
        shiftName:
          body.shiftName ||
          body.shift_name,
        revenue:
          body.revenue,
        foodCost:
          body.foodCost,
        laborCost:
          body.laborCost,
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
