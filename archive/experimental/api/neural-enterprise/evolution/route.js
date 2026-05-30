import { NextResponse } from "next/server";

import { runNeuralEnterpriseEvolution } from "@/lib/finance/core/runNeuralEnterpriseEvolution";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const evolution =
      await runNeuralEnterpriseEvolution({
        tenantId:
          body.tenantId,
      });

    return NextResponse.json({
      success: true,
      evolution,
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
