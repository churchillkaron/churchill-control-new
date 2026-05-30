import { NextResponse } from "next/server";

import { getReconciliationExceptions } from "@/lib/finance/core/getReconciliationExceptions";

export async function POST(request) {
  try {
    const body = await request.json();

    const exceptions =
      await getReconciliationExceptions({
        tenantId: body.tenantId,
      });

    return NextResponse.json({
      success: true,
      exceptions,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: error.message,
      },
      {
        status: 400,
      }
    );
  }
}
