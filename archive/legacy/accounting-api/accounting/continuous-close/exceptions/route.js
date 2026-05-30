import { NextResponse } from "next/server";

import { getContinuousCloseExceptions } from "@/lib/finance/core/getContinuousCloseExceptions";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const exceptions =
      await getContinuousCloseExceptions({
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
