import { NextResponse } from "next/server";
import { getARAging } from "@/lib/finance/analytics/getARAging";

export async function POST(request) {
  try {
    const body = await request.json();

    const aging = await getARAging({
      tenantId: body.tenantId,
    });

    return NextResponse.json({
      success: true,
      aging,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      message: error.message,
    }, { status: 400 });
  }
}
