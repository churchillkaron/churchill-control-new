import { NextResponse } from "next/server";

import { runEventOrchestration } from "@/lib/finance/core/runEventOrchestration";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const results =
      await runEventOrchestration({
        tenantId:
          body.tenantId,
        parentEvent:
          body.parentEvent,
      });

    return NextResponse.json({
      success: true,
      results,
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
