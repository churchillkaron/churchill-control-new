import { NextResponse } from "next/server";

import { runComplianceValidation } from "@/lib/finance/core/runComplianceValidation";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const compliance =
      await runComplianceValidation({
        tenantId:
          body.tenantId,
      });

    return NextResponse.json({
      success: true,
      compliance,
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
