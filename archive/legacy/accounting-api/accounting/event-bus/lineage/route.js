import { NextResponse } from "next/server";

import { getEventLineage } from "@/lib/finance/core/getEventLineage";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const lineage =
      await getEventLineage({
        tenantId:
          body.tenantId,
        eventId:
          body.eventId,
      });

    return NextResponse.json({
      success: true,
      lineage,
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
