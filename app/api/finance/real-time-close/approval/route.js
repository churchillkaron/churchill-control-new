import { NextResponse } from "next/server";

import { approveRealTimeClose } from "@/lib/finance/period-close/approveRealTimeClose";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const approval =
      await approveRealTimeClose({
        tenantId:
          body.tenantId,
        closeCycleId:
          body.closeCycleId,
        approvedBy:
          body.approvedBy,
        approvalRole:
          body.approvalRole,
      });

    return NextResponse.json({
      success: true,
      approval,
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
