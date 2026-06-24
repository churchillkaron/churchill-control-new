import { NextResponse } from "next/server";
import { getWorkCenterOrders } from "@/lib/work-centers/getWorkCenterOrders";

export async function POST(req) {
  try {
    const body = await req.json();

    console.log("WORK_CENTER_API", body);

const result = await getWorkCenterOrders({
      tenantId: body.tenantId,
      workCenterId: body.workCenterId || null,
    });

    
console.log(
  "WORK_CENTER_RESULT",
  {
    success: result?.success,
    count: result?.data?.length || 0,
    first: result?.data?.[0] || null
  }
);

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
