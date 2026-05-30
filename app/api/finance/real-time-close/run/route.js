import { NextResponse } from "next/server";

import { runRealTimeClose } from "@/lib/finance/core/runRealTimeClose";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const result =
      await runRealTimeClose({
        tenantId:
          body.tenantId,
        closeDate:
          body.closeDate,
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
