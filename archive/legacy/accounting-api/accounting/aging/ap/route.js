import { NextResponse } from "next/server";
import { getAPAging } from "@/lib/finance/analytics/getAPAging";

export async function POST(request) {
  try {
    const body = await request.json();

    const aging = await getAPAging({
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
