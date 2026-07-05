export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";

import { getFinanceAnomalies } from "@/lib/finance/reporting/audit/getFinanceAnomalies";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const anomalies =
      await getFinanceAnomalies({
        organizationId:
          body.organizationId,
      });

    return NextResponse.json({
      success: true,
      anomalies,
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
