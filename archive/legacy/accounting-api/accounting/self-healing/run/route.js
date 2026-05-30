import { NextResponse } from "next/server";

import { runSelfHealingEngine } from "@/lib/finance/core/runSelfHealingEngine";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const actions =
      await runSelfHealingEngine({
        tenantId:
          body.tenantId,
      });

    return NextResponse.json({
      success: true,
      actions,
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
