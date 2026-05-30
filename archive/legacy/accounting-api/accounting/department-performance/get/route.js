import { NextResponse } from "next/server";
import { getDepartmentPerformance } from "@/lib/finance/management/getDepartmentPerformance";

export async function POST(request) {
  try {
    const body = await request.json();

    const performance = await getDepartmentPerformance({
      tenantId: body.tenantId,
    });

    return NextResponse.json({
      success: true,
      performance,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      message: error.message,
    }, { status: 400 });
  }
}
