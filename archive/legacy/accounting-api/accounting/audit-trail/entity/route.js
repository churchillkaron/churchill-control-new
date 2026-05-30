import { NextResponse } from "next/server";

import { getEntityAuditTrail } from "@/lib/finance/core/getEntityAuditTrail";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const audit =
      await getEntityAuditTrail({
        tenantId:
          body.tenantId,
        entityType:
          body.entityType,
        entityId:
          body.entityId,
      });

    return NextResponse.json({
      success: true,
      audit,
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
