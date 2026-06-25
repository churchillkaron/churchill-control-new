import { NextResponse } from "next/server";
import { moveGuestsBetweenTables } from "@/lib/restaurant/services/moveGuestsBetweenTables";

export async function POST(req) {
  try {
    const body = await req.json();

    const result = await moveGuestsBetweenTables({
      organizationId: body.organizationId || body.organization_id,
      sourceTableId: body.sourceTableId,
      targetTableId: body.targetTableId,
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
