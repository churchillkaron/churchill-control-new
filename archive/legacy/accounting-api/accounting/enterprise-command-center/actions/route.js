import { NextResponse } from "next/server";

import { getEnterpriseActions } from "@/lib/finance/core/getEnterpriseActions";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const actions =
      await getEnterpriseActions({
        tenantId:
          body.tenantId,
      });

    return NextResponse.json({
      success: true,
      actions,
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
