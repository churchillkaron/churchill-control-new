export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { checkFinancePermission } from "@/lib/shared/auth/checkFinancePermission";
import { listBankAccountsCommand } from "@/lib/finance/bank-accounts/runtime/BankAccountsApplicationService";

function statusFor(message) {
  return String(message || "").toLowerCase().includes("permission denied") ? 403 : 500;
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const access = await requireOrganizationAccess({
      organizationId:
        searchParams.get("organization_id") ||
        searchParams.get("organizationId"),
      request,
    });

    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error, bankAccounts: [], rows: [] },
        { status: access.status }
      );
    }

    await checkFinancePermission({
      organizationId: access.organizationId,
      userId: access.user?.id,
      permissionKey: "finance.banking.view",
      fullAccess: access.permissions?.includes("*") === true,
    });

    const bankAccountId = searchParams.get("bank_account_id") || searchParams.get("id") || null;

    const rows = await listBankAccountsCommand({
      organization_id: access.organizationId,
    });

    const filteredRows = bankAccountId
      ? rows.filter((row) => row?.id === bankAccountId)
      : rows;

    return NextResponse.json({
      success: true,
      bankAccounts: filteredRows,
      rows: filteredRows,
    });
  } catch (error) {
    const message = error.message || "Bank accounts load failed";
    return NextResponse.json(
      { success: false, error: message, bankAccounts: [], rows: [] },
      { status: statusFor(message) }
    );
  }
}
