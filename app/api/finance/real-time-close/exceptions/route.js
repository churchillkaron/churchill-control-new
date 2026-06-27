import { NextResponse } from "next/server";

import { getRealTimeCloseExceptions } from "@/lib/finance/period-close/getRealTimeCloseExceptions";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const exceptions =
      await getRealTimeCloseExceptions({
        organizationId:
          body.organizationId,
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
