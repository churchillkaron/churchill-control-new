import { NextResponse } from "next/server";

import { runAccountingAlerts } from "@/lib/finance/core/runAccountingAlerts";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const alerts =
      await runAccountingAlerts({
        tenantId:
          body.tenantId,
      });

    return NextResponse.json({
      success: true,
      alerts,
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
