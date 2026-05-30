import { NextResponse } from "next/server";

import { getDimensions } from "@/lib/finance/core/getDimensions";

export async function POST(request) {
  try {
    const body = await request.json();

    const dimensions = await getDimensions({
      tenantId: body.tenantId,
      dimensionType: body.dimensionType,
    });

    return NextResponse.json({
      success: true,
      dimensions,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: error.message,
      },
      {
        status: 400,
      }
    );
  }
}
