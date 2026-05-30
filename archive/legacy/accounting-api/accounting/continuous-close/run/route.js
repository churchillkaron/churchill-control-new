import { NextResponse } from "next/server";

import { runContinuousClose } from "@/lib/finance/core/runContinuousClose";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const result =
      await runContinuousClose({
        tenantId:
          body.tenantId,
        closePeriod:
          body.closePeriod,
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
