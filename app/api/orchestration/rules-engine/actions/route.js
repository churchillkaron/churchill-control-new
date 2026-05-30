import { NextResponse } from "next/server";

import { getRuleActions } from "@/lib/orchestration/getRuleActions";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const actions =
      await getRuleActions({
        tenantId:
          body.tenantId,
        triggerEvent:
          body.triggerEvent,
      });

    return NextResponse.json({
      success: true,
      actions,
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
