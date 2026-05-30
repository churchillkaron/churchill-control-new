import { NextResponse } from "next/server";

import { getCashPosition } from "@/lib/finance/core/getCashPosition";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const cashPosition =
      await getCashPosition({
        tenantId:
          body.tenantId,
      });

    return NextResponse.json({
      success: true,
      cashPosition,
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
