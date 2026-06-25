import { NextResponse } from "next/server";

import { getLedgerBalances } from "@/lib/finance/general-ledger/getLedgerBalances";

export async function POST(request) {
  try {
    const body = await request.json();

    const balances = await getLedgerBalances({
      tenantId: body.tenantId,
      startDate: body.startDate,
      endDate: body.endDate,
    });

    return NextResponse.json({
      success: true,
      balances,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: error.message,
      },
      {
        status: 400,
      }
    );
  }
}
