import { NextResponse } from "next/server";

import { evaluateRules } from "@/lib/orchestration/evaluateRules";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const executed =
      await evaluateRules({
        tenantId:
          body.tenantId,
        triggerEvent:
          body.triggerEvent,
        payload:
          body.payload,
      });

    return NextResponse.json({
      success: true,
      executed,
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
