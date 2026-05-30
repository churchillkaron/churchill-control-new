import { NextResponse } from "next/server";

import { runNeuralEnterpriseState } from "@/lib/finance/core/runNeuralEnterpriseState";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const state =
      await runNeuralEnterpriseState({
        tenantId:
          body.tenantId,
      });

    return NextResponse.json({
      success: true,
      state,
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
