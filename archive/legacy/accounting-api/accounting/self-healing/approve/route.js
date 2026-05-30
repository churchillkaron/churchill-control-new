import { NextResponse } from "next/server";

import { approveSelfHealingAction } from "@/lib/finance/core/approveSelfHealingAction";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const result =
      await approveSelfHealingAction({
        tenantId:
          body.tenantId,
        actionId:
          body.actionId,
      });

    return NextResponse.json({
      success: true,
      result,
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
