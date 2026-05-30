import { NextResponse } from "next/server";

import { getEventGovernanceAudit } from "@/lib/finance/core/getEventGovernanceAudit";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const audit =
      await getEventGovernanceAudit({
        tenantId:
          body.tenantId,
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
