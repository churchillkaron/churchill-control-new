import { NextResponse } from "next/server";

import { getEventProcessingStatus } from "@/lib/finance/core/getEventProcessingStatus";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const status =
      await getEventProcessingStatus({
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
