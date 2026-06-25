import { NextResponse } from "next/server";

import { calculateVATLiability } from "@/lib/finance/reporting/calculateVATLiability";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const tax =
      await calculateVATLiability({
        tenantId:
          body.tenantId,
        startDate:
          body.startDate,
        endDate:
          body.endDate,
      });

    return NextResponse.json({
      success: true,
      tax,
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
