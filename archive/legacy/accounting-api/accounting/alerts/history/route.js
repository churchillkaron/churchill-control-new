import { NextResponse } from "next/server";

import { getAccountingAlerts } from "@/lib/finance/core/getAccountingAlerts";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const alerts =
      await getAccountingAlerts({
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
