import { NextResponse } from "next/server";
import { getWorkCenterOrders } from "@/lib/work-centers/getWorkCenterOrders";

export async function POST(req) {
  try {
    const body = await req.json();

    const result = await getWorkCenterOrders({
      tenantId: body.tenantId,
      workCenterId: body.workCenterId || null,
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
