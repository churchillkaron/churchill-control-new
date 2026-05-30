import { NextResponse } from "next/server";

import { assignDimensionToJournalLine } from "@/lib/finance/core/assignDimensionToJournalLine";

export async function POST(request) {
  try {
    const body = await request.json();

    const assignment =
      await assignDimensionToJournalLine({
        tenantId: body.tenantId,
        journalLineId: body.journalLineId,
        dimensionId: body.dimensionId,
      });

    return NextResponse.json({
      success: true,
      assignment,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: error.message,
      },
      {
        status: 400,
      }
    );
  }
}
