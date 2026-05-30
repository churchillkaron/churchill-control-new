import { NextResponse } from "next/server";

import { runExecutiveDecisionEngine } from "@/lib/finance/core/runExecutiveDecisionEngine";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const decision =
      await runExecutiveDecisionEngine({
        tenantId:
          body.tenantId,
      });

    return NextResponse.json({
      success: true,
      decision,
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
