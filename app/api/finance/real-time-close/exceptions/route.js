import { NextResponse } from "next/server";

import { getRealTimeCloseExceptions } from "@/lib/finance/core/getRealTimeCloseExceptions";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const exceptions =
      await getRealTimeCloseExceptions({
        tenantId:
          body.tenantId,
      });

    return NextResponse.json({
      success: true,
      exceptions,
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
