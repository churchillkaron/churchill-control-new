import { NextResponse } from "next/server";

import { runTrialBalance } from "@/lib/finance/core/runTrialBalance";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const trialBalance =
      await runTrialBalance({
        tenantId:
          body.tenantId,
      });

    return NextResponse.json({
      success: true,
      trialBalance,
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
