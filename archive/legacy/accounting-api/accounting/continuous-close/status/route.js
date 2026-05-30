import { NextResponse } from "next/server";

import { getContinuousCloseStatus } from "@/lib/finance/core/getContinuousCloseStatus";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const status =
      await getContinuousCloseStatus({
        tenantId:
          body.tenantId,
      });

    return NextResponse.json({
      success: true,
      status,
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
