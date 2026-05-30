import { NextResponse } from "next/server";
import { getChartOfAccounts } from "@/lib/finance/master-data/getChartOfAccounts";

export async function POST(request) {
  try {
    const body = await request.json();

    const accounts = await getChartOfAccounts({
      tenantId: body.tenantId,
    });

    return NextResponse.json({
      success: true,
      accounts,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      message: error.message,
    }, { status: 400 });
  }
}
