import { NextResponse } from "next/server";

import { runSingularityCore } from "@/lib/finance/core/runSingularityCore";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const cycle =
      await runSingularityCore({
        tenantId:
          body.tenantId,
      });

    return NextResponse.json({
      success: true,
      cycle,
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
