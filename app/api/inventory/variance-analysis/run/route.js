import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";

import { runVarianceAnalysis } from "@/lib/inventory/stock-count/workflows/runVarianceAnalysis";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const access = await requireOrganizationAccess({
      organizationId: access.organizationId,
      request,
    });

    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error },
        { status: access.status || 403 },
      );
    }

    const analysis =
      await runVarianceAnalysis({
        organizationId: access.organizationId,
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
