import { NextResponse } from "next/server";

import { distributeServiceCharge } from "@/lib/payroll/core/distributeServiceCharge";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const distribution =
      await distributeServiceCharge({
        tenantId:
          body.tenantId,
        distributionPeriod:
          body.distributionPeriod,
        totalServiceCharge:
          body.totalServiceCharge,
      });

    return NextResponse.json({
      success: true,
      distribution,
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
