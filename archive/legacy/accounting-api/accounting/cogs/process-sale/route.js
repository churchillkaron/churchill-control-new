import { NextResponse } from "next/server";

import { processCOGSForSale } from "@/lib/finance/core/processCOGSForSale";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const result =
      await processCOGSForSale({
        tenantId:
          body.tenantId,
        saleEventId:
          body.saleEventId,
        itemId:
          body.itemId,
        quantity:
          body.quantity,
        revenueAmount:
          body.revenueAmount,
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
