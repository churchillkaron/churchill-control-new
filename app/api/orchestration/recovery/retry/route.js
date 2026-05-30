import { NextResponse } from "next/server";

import { retryFailedOrchestration } from "@/lib/orchestration/retryFailedOrchestration";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const retried =
      await retryFailedOrchestration({
        tenantId:
          body.tenantId,
      });

    return NextResponse.json({
      success: true,
      retried,
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
