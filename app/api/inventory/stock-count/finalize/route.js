import { NextResponse } from "next/server";

import { finalizeStockCount } from "@/lib/inventory/core/finalizeStockCount";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const result =
      await finalizeStockCount({
        tenantId:
          body.tenantId,
        sessionId:
          body.sessionId,
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
