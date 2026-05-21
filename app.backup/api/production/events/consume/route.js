export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { processConsumptionEvent } from "@/lib/production/processConsumptionEvent";

export async function POST(req) {
  try {
    console.log("PRODUCTION EVENT ROUTE HIT");

    const body = await req.json();

    console.log("REQUEST BODY:", body);

    const {
      tenantId,
      eventType,
      referenceId,
      payload,
    } = body;

    if (!tenantId || !eventType || !referenceId) {
      return NextResponse.json(
        {
          success: false,
          error: "MISSING_REQUIRED_FIELDS",
        },
        { status: 400 }
      );
    }

    const result = await processConsumptionEvent({
      tenantId,
      eventType,
      referenceId,
      payload,
    });

    console.log("PROCESS RESULT:", result);

    return NextResponse.json({
      success: true,
      result,
    });
  } catch (error) {
    console.error("PRODUCTION EVENT API ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 }
    );
  }
}
