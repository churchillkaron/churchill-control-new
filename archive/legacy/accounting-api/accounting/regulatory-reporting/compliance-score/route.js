import { NextResponse } from "next/server";

import { runComplianceScoring } from "@/lib/finance/core/runComplianceScoring";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const score =
      await runComplianceScoring({
        tenantId:
          body.tenantId,
      });

    return NextResponse.json({
      success: true,
      score,
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
