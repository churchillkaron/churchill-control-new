import { NextResponse } from "next/server";

import { emitInventoryConsumptionEvent } from "@/lib/finance/core/emitInventoryConsumptionEvent";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const result =
      await emitInventoryConsumptionEvent({
        tenantId:
          body.tenantId,
        productionId:
          body.productionId,
        amount:
          body.amount,
        department:
          body.department,
        costCenter:
          body.costCenter,
        entryDate:
          body.entryDate,
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
