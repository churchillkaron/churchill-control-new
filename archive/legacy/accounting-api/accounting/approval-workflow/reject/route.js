import { NextResponse } from "next/server";

import { rejectWorkflow } from "@/lib/finance/core/rejectWorkflow";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const workflow =
      await rejectWorkflow({
        workflowId:
          body.workflowId,
        approver:
          body.approver,
        notes:
          body.notes,
      });

    return NextResponse.json({
      success: true,
      workflow,
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
