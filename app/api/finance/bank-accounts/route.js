export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import {
  listBankAccountsCommand,
  exportBankAccountsCommand,
  importBankAccountsCommand,
  analyzeBankAccountsCommand,
} from "@/lib/finance/bank-accounts/runtime/BankAccountsApplicationService";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);

    const organization_id =
      searchParams.get("organization_id") ||
      searchParams.get("organizationId");

    const rows =
      await listBankAccountsCommand({
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
