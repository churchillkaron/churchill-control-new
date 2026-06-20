import { NextResponse } from "next/server";
import { listWorkCenters } from "@/lib/work-centers/listWorkCenters";

export async function POST(req) {
  try {
    const body = await req.json();

    const result = await listWorkCenters({
      organizationId: body.organizationId,
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error.message,
        data: [],
      },
      { status: 500 }
    );
  }
}
