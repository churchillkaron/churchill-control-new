import { NextResponse } from "next/server";

import {
  emitEvent,
} from "@/lib/shared/events/eventBus";

export async function POST() {

  const result =
    await emitEvent("PERIOD_CLOSE", {
      tenantId:
        "76e2caa6-dd78-49e5-b0f5-1ff94185c2d4",
      period:
        "2026-05",
      createdBy:
        "system",
    });

  return NextResponse.json({
    success: true,
    result,
  });

}
