import { NextResponse } from "next/server";

import { approveAutonomousClose } from "@/lib/finance/core/approveAutonomousClose";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const result =
      await approveAutonomousClose({
        tenantId:
          body.tenantId,
        cycleId:
          body.cycleId,
        approvedBy:
          body.approvedBy,
      });

    return NextResponse.json({
      success: true,
      result,
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
