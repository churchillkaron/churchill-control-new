import { NextResponse } from "next/server";

import { runMetaLearningCycle } from "@/lib/finance/core/runMetaLearningCycle";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const learning =
      await runMetaLearningCycle({
        tenantId:
          body.tenantId,
      });

    return NextResponse.json({
      success: true,
      learning,
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
