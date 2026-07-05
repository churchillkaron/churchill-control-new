export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";

import { getEntityRanking } from "@/lib/finance/reporting/reports/getEntityRanking";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const rankings =
      await getEntityRanking({
        organizationId:
          body.organizationId,
        entities:
          body.entities,
      });

    return NextResponse.json({
      success: true,
      rankings,
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
