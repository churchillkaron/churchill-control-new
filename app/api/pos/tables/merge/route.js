export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { mergeTables } from "@/lib/pos/mergeTables";

export async function POST(req) {
  try {
    const body = await req.json();

    const result = await mergeTables({
      organizationId: body.organizationId || body.organization_id,
      sourceTableId: body.sourceTableId,
      targetTableId: body.targetTableId,
      mergedBy: body.mergedBy || "SYSTEM",
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
