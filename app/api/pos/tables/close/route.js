import { NextResponse } from "next/server";
import { closeTableSession } from "@/lib/restaurant/services/closeTableSession";

export async function POST(req) {
  try {
    const body = await req.json();

    const result = await closeTableSession({
      organizationId: body.organizationId || body.organization_id,
      sessionId: body.sessionId,
    });

    return NextResponse.json({
      success: true,
      result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      {
        status: 500,
      }
    );
  }
}
