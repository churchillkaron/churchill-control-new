import { NextResponse } from "next/server";

import { runExecutiveAlerts } from "@/lib/intelligence/finance/runExecutiveAlerts";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const alerts =
      await runExecutiveAlerts({
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
