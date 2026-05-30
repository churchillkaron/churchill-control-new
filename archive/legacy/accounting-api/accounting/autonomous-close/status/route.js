import { NextResponse } from "next/server";

import { getAutonomousCloseStatus } from "@/lib/finance/core/getAutonomousCloseStatus";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const status =
      await getAutonomousCloseStatus({
        tenantId:
          body.tenantId,
      });

    return NextResponse.json({
      success: true,
      status,
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
