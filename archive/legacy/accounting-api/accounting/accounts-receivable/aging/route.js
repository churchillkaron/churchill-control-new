import { NextResponse } from "next/server";

import { runARAging } from "@/lib/finance/core/runARAging";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const aging =
      await runARAging({
        tenantId:
          body.tenantId,
      });

    return NextResponse.json({
      success: true,
      aging,
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
