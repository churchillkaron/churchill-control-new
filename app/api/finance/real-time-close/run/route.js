import { NextResponse } from "next/server";

import { runRealTimeClose } from "@/lib/finance/period-close/runRealTimeClose";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const result =
      await runRealTimeClose({
        organizationId:
          body.organizationId,
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
