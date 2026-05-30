import { NextResponse } from "next/server";

import { getWorkflowHistory } from "@/lib/finance/core/getWorkflowHistory";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const history =
      await getWorkflowHistory({
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
