export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { requireFinanceWorkspacePermission } from "@/lib/finance/workspaces/FinanceWorkspacePermissionPolicy";
import { archiveBankAccountCommand } from "@/lib/finance/bank-accounts/runtime/BankAccountsApplicationService";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function required(value, field) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new Error(`${field} required`);
  return normalized;
}

export async function POST(request) {
  try {
    const body = await request.json();
    const access = await requireOrganizationAccess({
      organizationId: body.organizationId || body.organization_id,
      request,
    });

    if (!access.success) {
      return NextResponse.json({ success: false, error: access.error }, { status: access.status });
    }

    await requireFinanceWorkspacePermission({
      capabilityId: "bank_accounts",
      operation: "write",
      access,
    });

    const id = required(body.id || body.bank_account_id || body.bankAccountId, "id");
    const { data: account, error: accountError } = await supabaseAdmin
      .from("bank_accounts")
      .select("id, active")
      .eq("organization_id", access.organizationId)
      .eq("id", id)
      .maybeSingle();
    if (accountError) throw accountError;
    if (!account) throw new Error("Bank Account not found in this organisation");

    const { count: unreconciledCount, error: ledgerError } = await supabaseAdmin
      .from("bank_ledger")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", access.organizationId)
      .eq("bank_account_id", id)
      .is("reconciled_at", null);
    if (ledgerError) throw ledgerError;
    if (Number(unreconciledCount || 0) > 0) {
      throw new Error("Bank Account cannot be archived while unreconciled ledger entries remain");
    }

    const record = await archiveBankAccountCommand({
      organization_id: access.organizationId,
      id,
    });

    return NextResponse.json({ success: true, record });
  } catch (error) {
    const message = error?.message || "Bank Account archive failed";
    const status = /permission denied/i.test(message)
      ? 403
      : /required|not found|cannot be archived/i.test(message)
        ? 400
        : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
