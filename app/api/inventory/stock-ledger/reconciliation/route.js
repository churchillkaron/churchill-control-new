import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";

import { runInventoryReconciliation } from "@/lib/inventory/stock-count/workflows/runInventoryReconciliation";

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

    const reconciliation =
      await runInventoryReconciliation({
        organizationId: access.organizationId,
        entityId:
          body.entityId ||
          body.entity_id,
        itemId:
          body.itemId ||
          body.item_id,
        actualQuantity:
          body.actualQuantity ||
          body.actual_quantity,
      });

    return NextResponse.json({
      success: true,
      reconciliation,
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
