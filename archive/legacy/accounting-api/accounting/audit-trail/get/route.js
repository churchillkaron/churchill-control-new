import { NextResponse } from "next/server";

import { getAuditTrail } from "@/lib/finance/core/getAuditTrail";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const audit =
      await getAuditTrail({
        tenantId:
          body.tenantId,
        startDate:
          body.startDate,
        endDate:
          body.endDate,
      });

    return NextResponse.json({
      success: true,
      audit,
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
