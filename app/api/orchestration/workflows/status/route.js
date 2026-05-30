import { NextResponse } from "next/server";

import { getWorkflowStatus } from "@/lib/orchestration/getWorkflowStatus";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const status =
      await getWorkflowStatus({
        tenantId:
          body.tenantId,
        executionId:
          body.executionId,
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
