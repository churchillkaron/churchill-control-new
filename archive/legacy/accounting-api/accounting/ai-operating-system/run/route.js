import { NextResponse } from "next/server";

import { runAIOperatingSystem } from "@/lib/finance/core/runAIOperatingSystem";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const cycle =
      await runAIOperatingSystem({
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
