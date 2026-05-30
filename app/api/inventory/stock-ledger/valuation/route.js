import { NextResponse } from "next/server";

import { updateStockLedger } from "@/lib/inventory/core/updateStockLedger";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const valuation =
      await updateStockLedger({
        tenantId:
          body.tenantId,
        itemId:
          body.itemId,
      });

    return NextResponse.json({
      success: true,
      valuation,
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
