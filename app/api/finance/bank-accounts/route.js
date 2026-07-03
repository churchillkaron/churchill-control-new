export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { listBankAccounts } from "@/lib/finance/bank-accounts/repositories/bankAccountRepository";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);

    const organization_id =
      searchParams.get("organization_id") ||
      searchParams.get("organizationId");

    const rows =
      await listBankAccounts({
        organization_id,
      });

    return NextResponse.json({
      success: true,
      bankAccounts: rows,
      rows,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error.message,
        bankAccounts: [],
        rows: [],
      },
      { status: 500 }
    );
  }
}
