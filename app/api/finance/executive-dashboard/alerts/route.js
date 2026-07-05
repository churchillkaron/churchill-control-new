export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";

import { getExecutiveAlerts } from "@/lib/finance/reporting/alerts/getExecutiveAlerts";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const alerts =
      await getExecutiveAlerts({
        organizationId:
          body.organizationId,
      });

    return NextResponse.json({
      success: true,
      alerts,
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
