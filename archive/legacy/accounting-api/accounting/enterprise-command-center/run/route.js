import { NextResponse } from "next/server";

import { runEnterpriseCommandCenter } from "@/lib/finance/core/runEnterpriseCommandCenter";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const snapshot =
      await runEnterpriseCommandCenter({
        tenantId:
          body.tenantId,
      });

    return NextResponse.json({
      success: true,
      snapshot,
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
