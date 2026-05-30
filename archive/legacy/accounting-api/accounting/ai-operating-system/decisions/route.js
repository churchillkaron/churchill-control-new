import { NextResponse } from "next/server";

import { runAIExecutiveDecisions } from "@/lib/finance/core/runAIExecutiveDecisions";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const decisions =
      await runAIExecutiveDecisions({
        tenantId:
          body.tenantId,
      });

    return NextResponse.json({
      success: true,
      decisions,
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
