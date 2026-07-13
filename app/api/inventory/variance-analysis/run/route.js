import { NextResponse } from "next/server";

import { runVarianceAnalysis } from "@/lib/inventory/stock-count/workflows/runVarianceAnalysis";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const analysis =
      await runVarianceAnalysis({
        organizationId:
          body.organizationId ||
          body.organization_id,
        entityId:
          body.entityId ||
          body.entity_id,
        itemId:
          body.itemId ||
          body.item_id,
        varianceQuantity:
          body.varianceQuantity ||
          body.variance_quantity,
        varianceValue:
          body.varianceValue ||
          body.variance_value,
      });

    return NextResponse.json({
      success: true,
      analysis,
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
