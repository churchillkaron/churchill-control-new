import { NextResponse } from "next/server";

import { runEnterpriseConsciousness } from "@/lib/finance/core/runEnterpriseConsciousness";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const consciousness =
      await runEnterpriseConsciousness({
        tenantId:
          body.tenantId,
      });

    return NextResponse.json({
      success: true,
      consciousness,
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
