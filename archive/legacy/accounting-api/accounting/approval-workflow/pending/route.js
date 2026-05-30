import { NextResponse } from "next/server";

import { getPendingApprovals } from "@/lib/finance/core/getPendingApprovals";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const approvals =
      await getPendingApprovals({
        tenantId:
          body.tenantId,
      });

    return NextResponse.json({
      success: true,
      approvals,
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
