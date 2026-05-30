import { NextResponse } from "next/server";

import { getAccountingFailures } from "@/lib/finance/core/getAccountingFailures";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const failures =
      await getAccountingFailures({
        tenantId:
          body.tenantId,
      });

    return NextResponse.json({
      success: true,
      failures,
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
