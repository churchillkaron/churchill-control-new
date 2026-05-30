import { NextResponse } from "next/server";

import { runExecutiveKPIs } from "@/lib/intelligence/finance/runExecutiveKPIs";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const kpis =
      await runExecutiveKPIs({
        tenantId:
          body.tenantId,
      });

    return NextResponse.json({
      success: true,
      kpis,
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
