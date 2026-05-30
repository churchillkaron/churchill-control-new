import { NextResponse } from "next/server";

import { createEntityHistorySnapshot } from "@/lib/finance/core/createEntityHistorySnapshot";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const snapshot =
      await createEntityHistorySnapshot({
        tenantId:
          body.tenantId,
        entityType:
          body.entityType,
        entityId:
          body.entityId,
        historySnapshot:
          body.historySnapshot,
        snapshotType:
          body.snapshotType,
      });

    return NextResponse.json({
      success: true,
      snapshot,
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
