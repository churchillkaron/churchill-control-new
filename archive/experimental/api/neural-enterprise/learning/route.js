import { NextResponse } from "next/server";

import { runNeuralEnterpriseLearning } from "@/lib/finance/core/runNeuralEnterpriseLearning";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const learning =
      await runNeuralEnterpriseLearning({
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
