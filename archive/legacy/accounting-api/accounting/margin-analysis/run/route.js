import { NextResponse } from "next/server";

import { runMarginAnalysis } from "@/lib/finance/core/runMarginAnalysis";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const analysis =
      await runMarginAnalysis({
        tenantId:
          body.tenantId,
      });

    return NextResponse.json({
      success: true,
      analysis,
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
