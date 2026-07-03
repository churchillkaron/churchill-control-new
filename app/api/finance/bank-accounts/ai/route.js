export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { listBankAccounts } from "@/lib/finance/bank-accounts/repositories/bankAccountRepository";

export async function POST(request) {
  try {
    const body = await request.json();

    const organization_id =
      body.organization_id ||
      body.organizationId;

    const rows =
      await listBankAccounts({
        organization_id,
      });

    return NextResponse.json({
      success: true,
      mode: body.mode || "analyze",
      summary: {
        accounts: rows.length,
        currencies: [...new Set(rows.map(r => r.currency_code).filter(Boolean))],
        active: rows.filter(r => r.active !== false).length,
        inactive: rows.filter(r => r.active === false).length,
      },
      recommendations: [
        "Review inactive bank accounts.",
        "Import recent bank statements before reconciliation.",
        "Check missing account numbers, SWIFT, IBAN, and currency codes.",
      ],
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 }
    );
  }
}
