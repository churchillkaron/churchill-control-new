import { NextResponse } from "next/server";

import { getEventSchema } from "@/lib/finance/core/getEventSchema";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const schema =
      await getEventSchema({
        tenantId:
          body.tenantId,
        eventType:
          body.eventType,
        schemaVersion:
          body.schemaVersion || "v1",
      });

    return NextResponse.json({
      success: true,
      schema,
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
