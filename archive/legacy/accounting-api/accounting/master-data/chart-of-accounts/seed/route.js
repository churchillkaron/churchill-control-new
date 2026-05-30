import { NextResponse } from "next/server";
import { seedChartOfAccounts } from "@/lib/finance/master-data/seedChartOfAccounts";

export async function POST(request) {
  try {
    const body = await request.json();

    const accounts = await seedChartOfAccounts({
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
