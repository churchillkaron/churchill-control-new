import { NextResponse } from "next/server";

import { runExecutiveIntelligence } from "@/lib/finance/core/runExecutiveIntelligence";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const intelligence =
      await runExecutiveIntelligence({
        tenantId:
          body.tenantId,
      });

    return NextResponse.json({
      success: true,
      intelligence,
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
