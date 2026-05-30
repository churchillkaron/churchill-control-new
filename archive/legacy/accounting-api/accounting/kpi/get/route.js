import { NextResponse } from "next/server";
import { getAccountingKPIs } from "@/lib/finance/getAccountingKPIs";

export async function POST(request) {
  try {
    const body = await request.json();

    const kpis = await getAccountingKPIs({
      tenantId: body.tenantId,
    });

    return NextResponse.json({
      success: true,
      kpis,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      message: error.message,
    }, { status: 400 });
  }
}
