import { NextResponse } from "next/server";

import { runDayClosedFlow } from "@/lib/orchestration/runDayClosedFlow";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const result =
      await runDayClosedFlow({
        tenantId:
          body.tenantId,
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
