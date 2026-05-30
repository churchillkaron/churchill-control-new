import { NextResponse } from "next/server";

import { createRegulatoryFiling } from "@/lib/finance/core/createRegulatoryFiling";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const filing =
      await createRegulatoryFiling({
        tenantId:
          body.tenantId,
        reportRunId:
          body.reportRunId,
        filingAuthority:
          body.filingAuthority,
      });

    return NextResponse.json({
      success: true,
      filing,
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
