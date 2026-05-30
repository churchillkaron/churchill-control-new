import { NextResponse } from "next/server";

import { runEntityProfitabilityRanking } from "@/lib/intelligence/finance/runEntityProfitabilityRanking";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const rankings =
      await runEntityProfitabilityRanking({
        tenantId:
          body.tenantId,
        entities:
          body.entities,
      });

    return NextResponse.json({
      success: true,
      rankings,
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
