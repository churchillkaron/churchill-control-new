import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";

import { finalizeStockCount } from "@/lib/inventory/stock-count/finalizeStockCount";

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

    const result =
      await finalizeStockCount({
        organizationId: access.organizationId,
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
