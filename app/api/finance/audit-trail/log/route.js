import { NextResponse } from "next/server";

import { createAuditLog } from "@/lib/platform/audit/createAuditLog";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const log =
      await createAuditLog({
        organizationId:
          body.organizationId,
        moduleName:
          body.moduleName,
        entityType:
          body.entityType,
        entityId:
          body.entityId,
        actionType:
          body.actionType,
        previousData:
          body.previousData,
        newData:
          body.newData,
        changedBy:
          body.changedBy,
      });

    return NextResponse.json({
      success: true,
      log,
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
