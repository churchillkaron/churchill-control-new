import { NextResponse } from "next/server";

import { runAutonomousCloseCycle } from "@/lib/finance/core/runAutonomousCloseCycle";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const result =
      await runAutonomousCloseCycle({
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
