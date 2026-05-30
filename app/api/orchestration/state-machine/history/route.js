import { NextResponse } from "next/server";

import { getStateHistory } from "@/lib/orchestration/getStateHistory";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const history =
      await getStateHistory({
        tenantId:
          body.tenantId,
        entityType:
          body.entityType,
        entityId:
          body.entityId,
      });

    return NextResponse.json({
      success: true,
      history,
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
