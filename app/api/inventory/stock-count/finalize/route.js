import { NextResponse } from "next/server";

import { finalizeStockCount } from "@/lib/inventory/stock-count/finalizeStockCount";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const result =
      await finalizeStockCount({
        organizationId:
          body.organizationId ||
          body.organization_id,
        entityId:
          body.entityId ||
          body.entity_id,
        sessionId:
          body.sessionId ||
          body.session_id,
      });

    return NextResponse.json({
      success: true,
      result,
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
