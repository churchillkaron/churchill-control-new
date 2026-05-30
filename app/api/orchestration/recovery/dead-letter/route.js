import { NextResponse } from "next/server";

import { moveToDeadLetterQueue } from "@/lib/orchestration/moveToDeadLetterQueue";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const deadLetter =
      await moveToDeadLetterQueue({
        tenantId:
          body.tenantId,
        orchestrationType:
          body.orchestrationType,
        referenceId:
          body.referenceId,
        failedStep:
          body.failedStep,
        errorMessage:
          body.errorMessage,
      });

    return NextResponse.json({
      success: true,
      deadLetter,
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
