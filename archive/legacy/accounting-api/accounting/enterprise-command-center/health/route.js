import { NextResponse } from "next/server";

import { getEnterpriseHealth } from "@/lib/finance/core/getEnterpriseHealth";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const health =
      await getEnterpriseHealth({
        tenantId:
          body.tenantId,
      });

    return NextResponse.json({
      success: true,
      health,
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
