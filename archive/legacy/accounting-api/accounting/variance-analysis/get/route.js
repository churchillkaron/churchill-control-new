import { NextResponse } from "next/server";
import { getVarianceAnalysis } from "@/lib/finance/management/getVarianceAnalysis";

export async function POST(request) {
  try {
    const body = await request.json();

    const variances = await getVarianceAnalysis({
      tenantId: body.tenantId,
    });

    return NextResponse.json({
      success: true,
      variances,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      message: error.message,
    }, { status: 400 });
  }
}
