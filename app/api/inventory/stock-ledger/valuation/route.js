import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";

import { updateStockLedger } from "@/lib/inventory/ledger/capabilities/updateStockLedger";

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

    const valuation =
      await updateStockLedger({
        organizationId: access.organizationId,
        entityId:
          body.entityId ||
          body.entity_id,
        itemId:
          body.itemId ||
          body.item_id,
      });

    return NextResponse.json({
      success: true,
      valuation,
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
