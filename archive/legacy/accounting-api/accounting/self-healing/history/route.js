import { NextResponse } from "next/server";

import { getSelfHealingHistory } from "@/lib/finance/core/getSelfHealingHistory";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const history =
      await getSelfHealingHistory({
        tenantId:
          body.tenantId,
      });

    return NextResponse.json({
      success: true,
      history,
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
