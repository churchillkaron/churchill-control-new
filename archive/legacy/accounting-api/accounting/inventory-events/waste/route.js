import { NextResponse } from "next/server";

import { emitInventoryWasteEvent } from "@/lib/production/finance/emitInventoryWasteEvent";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const result =
      await emitInventoryWasteEvent({
        tenantId:
          body.tenantId,
        wasteId:
          body.wasteId,
        amount:
          body.amount,
        department:
          body.department,
        reason:
          body.reason,
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
