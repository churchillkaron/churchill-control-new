import { NextResponse } from "next/server";
import { getWorkingCapital } from "@/lib/finance/executive/getWorkingCapital";

export async function POST(request) {
  try {
    const body = await request.json();

    const metrics = await getWorkingCapital({
      tenantId: body.tenantId,
    });

    return NextResponse.json({
      success: true,
      metrics,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      message: error.message,
    }, { status: 400 });
  }
}
